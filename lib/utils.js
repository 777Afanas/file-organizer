export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function drawProgressBar(current, total, width = 20) {
  const percentage = current / total;
  const filled = Math.round(percentage * width) || 0;
  const bar =
    "█".repeat(Math.min(filled, width)) +
    "░".repeat(Math.max(width - filled, 0));
  return `${bar} ${current}/${total}`;
}

export function handleError(error, contextPath) {
  if (error.code === "ENOENT") {
    console.error(`❌ Error: Directory not found: ${contextPath}`);
  } else if (error.code === "EACCES") {
    console.error(`❌ Error: Permission denied: ${contextPath}`);
  } else {
    console.error(`❌ Unexpected error: ${error.message}`);
  }
  process.exit(1);
}
