import type { AdminCapabilityFamilyCatalogEntry } from "@/lib/api/api-client";

export function filterCapabilityFamilies(
  entries: AdminCapabilityFamilyCatalogEntry[],
  query: string,
) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return entries;
  return entries.filter((entry) =>
    `${entry.family} ${entry.display_name} ${entry.description}`
      .toLowerCase()
      .includes(keyword),
  );
}

export function toggleAllowedCapabilityFamily(
  selected: string[],
  family: string,
  checked: boolean,
) {
  if (checked) return Array.from(new Set([...selected, family])).sort();
  return selected.filter((item) => item !== family);
}

export function unavailableSelectedCapabilityFamilies(
  selected: string[],
  entries: AdminCapabilityFamilyCatalogEntry[],
) {
  const available = new Set(entries.map((entry) => entry.family));
  return selected.filter((family) => !available.has(family));
}

export function selectEveryCurrentCapabilityFamily(
  entries: AdminCapabilityFamilyCatalogEntry[],
  unavailableSelected: string[],
) {
  return Array.from(
    new Set([
      ...entries.map((entry) => entry.family),
      ...unavailableSelected,
    ]),
  ).sort();
}
