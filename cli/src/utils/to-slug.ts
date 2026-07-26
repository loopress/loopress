import slugify from 'slugify'

// The one slugification used everywhere a name becomes part of a filename or an api slug.
// `fallback` covers values that slugify to nothing (empty, punctuation-only); callers that
// can genuinely live with an empty slug just omit it.
export function toSlug(value: string, fallback = ''): string {
  return slugify(value, {lower: true, strict: true}) || fallback
}
