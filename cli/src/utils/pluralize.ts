// `${pluralize(files.length, 'form')}` renders "1 form" or "3 forms"; pass an explicit
// plural for irregular words (e.g. `pluralize(n, 'box', 'boxes')`).
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
