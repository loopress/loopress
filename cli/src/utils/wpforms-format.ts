export const WPFORMS_ENDPOINT = 'loopress/v1/wpforms'

// Deliberately loose, same reasoning as getAcfKey in acf-format.ts: WPForms' own form format
// (fields, settings, notifications, confirmations, providers, meta) is large, deeply nested,
// and versioned by whichever WPForms release wrote it. We only need `id` for filenames/identity
// and `settings.form_title` for display; everything else round-trips through pull/push untouched.
export function getWpFormsId(data: Record<string, unknown>): null | number {
  const id = Number(data.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function getWpFormsTitle(data: Record<string, unknown>): string {
  const settings = data.settings as Record<string, unknown> | undefined
  const title = settings?.form_title
  return typeof title === 'string' && title.trim() !== '' ? title : '(untitled)'
}
