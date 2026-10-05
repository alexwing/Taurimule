export function safeDecode(val?: string): string {
  if (!val) return "";
  try {
    return decodeURIComponent(val);
  } catch {
    try {
      return decodeURI(val);
    } catch {
      return val;
    }
  }
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "0 B/s";
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function formatSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getFileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mkv") || lower.endsWith(".mp4") || lower.endsWith(".avi")) return "🎬";
  if (lower.endsWith(".mp3") || lower.endsWith(".flac") || lower.endsWith(".wav")) return "🎵";
  if (lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".7z")) return "📦";
  if (lower.endsWith(".iso") || lower.endsWith(".bin") || lower.endsWith(".img")) return "💿";
  if (lower.endsWith(".exe") || lower.endsWith(".msi")) return "💾";
  if (lower.endsWith(".pdf") || lower.endsWith(".txt") || lower.endsWith(".doc")) return "📄";
  return "📁";
}
