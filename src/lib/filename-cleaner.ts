// TauriMule Filename Cleaning Engine — Inspired by Syncdrome's renameEngine.ts
// Cleans release junk, scene tags, dots, underscores, brackets, and URLs
// while preserving file extension and calculating a detailed diff.

export interface DiffSegment {
  text: string;
  kind: "keep" | "del" | "add";
}

export interface CleanResult {
  original: string;
  cleaned: string;
  baseOriginal: string;
  baseCleaned: string;
  extension: string;
  changed: boolean;
  diff: DiffSegment[];
}

const COMMON_PATTERNS = [
  // Web domains with www or in brackets or known trackers
  /\bwww\.[a-z0-9\-]+\.[a-z]{2,5}\b/gi,
  /[\[\(][a-z0-9\-]+\.(?:org|com|net|es|me|to|info|cc|ws|io|tv)[\]\)]/gi,
  /\b(?:hispashare|hispamula|elitetorrent|divxtotal|pctnew|estrenosdtl|descargas2020|subdivx|sharereactor)\.(?:org|com|net|es|me|to|info)\b/gi,
  /\(?(?:hispamula|hispashare|emule|sharereactor)\)?/gi,
  // By uploader (e.g. by.CHINAKO, by.nara, by-TEAM)
  /\bby[\.\s_-]+[a-zA-Z0-9_\-]+/gi,
  // Resolution & Quality
  /\b(2160p?|1080[pi]?|720p?|480p?|576p?|4k|uhd|fhd|hd|micro-?4k|micro-?hd|hdrip)\b/gi,
  // Video Codecs & Profiles
  /\b(x264|x265|h\.?264|h\.?265|hevc|avc|xvid|divx|10bits?|10b\b|8bits?|8b\b|hdr(10(\+)?)?|sdr|dv|dolby[-. ]?vision)\b/gi,
  // Sources
  /\b(web-?dl|web-?rip|web|hdtv|bluray|blu-ray|bdrip|brrip|dvdrip|dvd|hd-?rip|cam|ts|telesync|remux)\b/gi,
  // Audio Formats & Channels
  /\b(ac3|aac|dts(-hd)?|truehd|atmos|mp3|flac|ddp?5\.?1|dd\+?|5\.1|7\.1|2\.0)\b/gi,
  // Quality & Edition Tags
  /\b(proper|repack|extended|unrated|directors\.?cut|remastered)\b/gi,
  // Languages & Subs
  /\b(spanish|castellano|español|english|french|german|sub(s|bed)?|vose|dual|multi|spa-eng-sub)\b/gi,
  // Non-year bracketed / parenthesized tags e.g. [grupots], (Spanish.English.Subs)
  // (Negative lookahead ensures 4-digit years like (2002) are NOT matched)
  /\[(?!\d{4}\])[^\]]{2,30}\]/gi,
  /\((?!\d{4}\))[^\)]{2,30}\)/gi,
  // Unclosed language/sub tags at end of base e.g. (Spa-Eng-Sub
  /\((?:spa|eng|sub|castellano|vose)[^\)]*$/gi,
  // Trailing release group e.g. -grupots, -Scene, _GROUP
  /-[a-zA-Z0-9_]{1,15}$/gi,
];

/**
 * Strips release tags, scene junk, dots, and underscores from a filename.
 */
export function cleanFilename(filename: string, customCutPattern?: string): CleanResult {
  const dotIndex = filename.lastIndexOf(".");
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : "";
  const baseOriginal = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;

  let working = baseOriginal;

  // 1. Custom cut pattern if provided (from first match to end of base, like Syncdrome)
  if (customCutPattern && customCutPattern.trim()) {
    try {
      const re = new RegExp(customCutPattern, "i");
      const m = re.exec(working);
      if (m && m.index !== undefined) {
        working = working.slice(0, m.index);
      }
    } catch {
      const idx = working.toLowerCase().indexOf(customCutPattern.toLowerCase());
      if (idx !== -1) {
        working = working.slice(0, idx);
      }
    }
  }

  // 2. Remove common scene patterns
  for (const pat of COMMON_PATTERNS) {
    working = working.replace(pat, " ");
  }

  // 3. Replace dots, underscores, and hyphens with spaces (when used as separators)
  working = working.replace(/[\._]/g, " ");

  // 4. Remove dangling brackets, parentheses, or braces (protecting 4-digit years like (2002))
  working = working.replace(/\((?!\d{4}\))|(?<!\(\d{4})\)/g, " ").replace(/[\[\]\{\}]/g, " ");

  // 5. Collapse duplicate spaces
  working = working.replace(/\s+/g, " ").trim();

  // 6. Clean dangling hyphens or punctuation at start/end
  working = working.replace(/^[\s\-_,\.]+|[\s\-_,\.]+$/g, "");

  // 7. Capitalize cleanly (Title case for words)
  const baseCleaned = working
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      // Keep season/episode like S01E02 or 10x03 as uppercase
      if (/^[sS]\d+([eE]\d+)?$/i.test(word) || /^\d+[xX]\d+$/i.test(word)) {
        return word.toUpperCase();
      }
      // Leave short common lowercase words if in middle
      const lower = word.toLowerCase();
      if (["de", "en", "el", "la", "los", "las", "y", "o", "a", "of", "the", "and", "in"].includes(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");

  const cleaned = baseCleaned ? `${baseCleaned}${extension}` : filename;
  const changed = cleaned !== filename;

  // Generate diff segments
  const diff = generateDiff(filename, cleaned);

  return {
    original: filename,
    cleaned,
    baseOriginal,
    baseCleaned,
    extension,
    changed,
    diff,
  };
}

function generateDiff(original: string, cleaned: string): DiffSegment[] {
  if (original === cleaned) {
    return [{ text: original, kind: "keep" }];
  }

  return [
    { text: original, kind: "del" },
    { text: cleaned, kind: "add" },
  ];
}

export function renderDiffHtml(diff: DiffSegment[]): string {
  return diff
    .map((seg) => {
      if (seg.kind === "del") {
        return `<span class="diff-del">${escapeHtml(seg.text)}</span>`;
      }
      if (seg.kind === "add") {
        return `<span class="diff-add">${escapeHtml(seg.text)}</span>`;
      }
      return `<span>${escapeHtml(seg.text)}</span>`;
    })
    .join(" ");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

