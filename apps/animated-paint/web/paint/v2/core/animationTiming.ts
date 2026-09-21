// Metadata is tied to the recipe, so editing JS cannot accidentally freeze it.
const hashes = new Map<string, string>()
export function animationSourceHash(source: string): string {
  const cached = hashes.get(source)
  if (cached) return cached
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)
  const value = (hash >>> 0).toString(16)
  if (hashes.size >= 128) hashes.delete(hashes.keys().next().value!)
  hashes.set(source, value)
  return value
}
