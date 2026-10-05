// TauriMule HTML helpers — escaping for untrusted data interpolated into innerHTML templates.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes a value for use as text content or inside a double-quoted HTML attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
