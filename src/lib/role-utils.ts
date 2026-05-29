export function getUniqueSlug(label: string, existingSlugs: string[]): string {
  const baseSlug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  if (!baseSlug) return "";

  const existing = new Set(existingSlugs.map((slug) => slug.toLowerCase()));
  let finalSlug = baseSlug;
  let counter = 1;

  while (existing.has(finalSlug)) {
    finalSlug = `${baseSlug}_${counter}`;
    counter += 1;
  }

  return finalSlug;
}
