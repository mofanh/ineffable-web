const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function sandboxPreviewLaunchPath(exposureId: string) {
  return `/sandbox-preview/${encodeURIComponent(exposureId)}`
}

export function sandboxPreviewExposureIdFromUrl(value: string) {
  let url: URL
  try {
    url = new URL(value, window.location.origin)
  } catch {
    return null
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null
  }

  const [exposureId] = url.hostname.split(".")
  if (!UUID_PATTERN.test(exposureId)) {
    return null
  }

  const previewHostname = url.hostname.slice(exposureId.length + 1)
  if (
    previewHostname === "preview.localhost" ||
    previewHostname.startsWith("preview.") ||
    previewHostname.includes(".preview.")
  ) {
    return exposureId
  }

  return null
}
