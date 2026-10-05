export interface ParsedEd2kInfo {
  rawLink: string;
  name: string;
  size: number;
  hash: string;
}

export function parseAllEd2kLinks(text: string): ParsedEd2kInfo[] {
  if (!text) return [];
  let cleanText = text;
  try {
    cleanText = decodeURIComponent(text);
  } catch {}
  const lines = cleanText.split(/\r?\n/);
  const links: ParsedEd2kInfo[] = [];
  const seenHashes = new Set<string>();

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;
    try {
      trimmed = decodeURIComponent(trimmed);
    } catch {}
    const match = trimmed.match(/ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([a-fA-F0-9]{32})/);
    if (match) {
      const rawName = match[1];
      const size = parseInt(match[2], 10);
      const hash = match[3].toUpperCase();
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        name = rawName;
      }
      let rawLink = trimmed;
      if (!rawLink.startsWith("ed2k://")) {
        rawLink = `ed2k://|file|${rawName}|${size}|${hash}|/`;
      } else if (!rawLink.endsWith("|/")) {
        rawLink = rawLink.endsWith("/") ? rawLink : (rawLink.endsWith("|") ? rawLink + "/" : rawLink + "|/");
      }
      links.push({ rawLink, name, size, hash });
    }
  }

  // Also catch multiple links pasted on a single line
  if (links.length <= 1 && cleanText.includes("ed2k://|file|")) {
    const globalRegex = /ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([a-fA-F0-9]{32})[^\r\n]*?\|\//g;
    let m: RegExpExecArray | null;
    const inlineLinks: ParsedEd2kInfo[] = [];
    const inlineSeen = new Set<string>();
    while ((m = globalRegex.exec(cleanText)) !== null) {
      const rawName = m[1];
      const size = parseInt(m[2], 10);
      const hash = m[3].toUpperCase();
      if (inlineSeen.has(hash)) continue;
      inlineSeen.add(hash);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        name = rawName;
      }
      inlineLinks.push({
        rawLink: m[0],
        name,
        size,
        hash,
      });
    }
    if (inlineLinks.length > links.length) {
      return inlineLinks;
    }
  }

  return links;
}

export function parseEd2kLink(text: string): ParsedEd2kInfo | null {
  const all = parseAllEd2kLinks(text);
  return all.length > 0 ? all[0] : null;
}
