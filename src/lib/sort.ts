import type { DownloadInfo, SearchResult } from "./tauri-bridge";

export type SortDirection = "asc" | "desc";
export type DownloadSortColumn = "name" | "size" | "progress" | "speed" | "sources";
export type SearchSortColumn = "name" | "size" | "sources" | "file_type";

export function sortDownloads(
  items: DownloadInfo[],
  col: DownloadSortColumn,
  dir: SortDirection
): DownloadInfo[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    switch (col) {
      case "name":
        return mult * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      case "size":
        return mult * (a.size_total - b.size_total);
      case "progress":
        return mult * (a.progress - b.progress);
      case "speed":
        return mult * (a.speed - b.speed);
      case "sources": {
        const scoreA = a.sources_transferring * 100000 + a.sources_total;
        const scoreB = b.sources_transferring * 100000 + b.sources_total;
        return mult * (scoreA - scoreB);
      }
      default:
        return 0;
    }
  });
}

export function renderDownloadSortIcon(
  col: DownloadSortColumn,
  activeCol: DownloadSortColumn,
  activeDir: SortDirection
): string {
  if (activeCol === col) {
    return `<span class="sort-icon">${activeDir === "asc" ? "▲" : "▼"}</span>`;
  }
  return `<span class="sort-icon sort-icon-muted">⇅</span>`;
}

export function sortSearchResults(
  items: SearchResult[],
  col: SearchSortColumn,
  dir: SortDirection
): SearchResult[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    switch (col) {
      case "name":
        return mult * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      case "size":
        return mult * (a.size - b.size);
      case "sources":
        return mult * (a.sources - b.sources);
      case "file_type":
        return mult * a.file_type.localeCompare(b.file_type);
      default:
        return 0;
    }
  });
}

export function renderSearchSortIcon(
  col: SearchSortColumn,
  activeCol: SearchSortColumn,
  activeDir: SortDirection
): string {
  if (activeCol === col) {
    return `<span class="sort-icon">${activeDir === "asc" ? "▲" : "▼"}</span>`;
  }
  return `<span class="sort-icon sort-icon-muted">⇅</span>`;
}
