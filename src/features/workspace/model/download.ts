export function downloadTextFile(
  filename: string,
  content: string,
  type = "text/plain"
) {
  downloadBlob(filename, new Blob([content], { type }))
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
