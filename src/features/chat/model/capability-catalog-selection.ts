import type {
  CapabilityCatalogEntry,
  CapabilityExposureKey,
} from "@/lib/api/api-client"

export function capabilityKeysEqual(
  left: CapabilityExposureKey,
  right: CapabilityExposureKey
) {
  return (
    left.provider_id === right.provider_id &&
    left.capability_id === right.capability_id
  )
}

export function capabilityCatalogFamilies(entries: CapabilityCatalogEntry[]) {
  return Array.from(
    new Set(
      entries
        .map((entry) => entry.family)
        .filter((family): family is string => Boolean(family))
    )
  ).sort()
}

export function filterCapabilityCatalog(
  entries: CapabilityCatalogEntry[],
  search: string
) {
  const query = search.trim().toLowerCase()
  if (!query) return entries
  return entries.filter((entry) =>
    `${entry.name} ${entry.model_tool_name} ${entry.description} ${entry.provider_name} ${entry.family ?? ""}`
      .toLowerCase()
      .includes(query)
  )
}

export function groupCapabilityCatalog(entries: CapabilityCatalogEntry[]) {
  const groups = new Map<string, CapabilityCatalogEntry[]>()
  for (const entry of entries) {
    const family = entry.family ?? "other"
    const group = groups.get(family)
    if (group) group.push(entry)
    else groups.set(family, [entry])
  }
  return Array.from(groups, ([family, items]) => ({ family, items }))
}

export function updateSelectedCapabilityKeys(
  current: CapabilityExposureKey[],
  entry: CapabilityCatalogEntry,
  checked: boolean
) {
  if (checked) {
    return current.some((candidate) => capabilityKeysEqual(candidate, entry.key))
      ? current
      : [...current, entry.key]
  }
  return current.filter((candidate) => !capabilityKeysEqual(candidate, entry.key))
}
