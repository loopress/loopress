export const FORM_ENDPOINT = 'loopress/v1/forms'

// Deliberately loose, same reasoning as getAcfKey in acf-format.ts: a form plugin's own data
// format (WPForms today: fields, settings, notifications, confirmations, providers, meta; other
// WordPress form plugins may be supported later, same shape as snippet-format.ts's Code
// Snippets/WPCode split) is large, deeply nested, and versioned by whichever plugin release
// wrote it. We only need `id` for filenames/identity and `settings.form_title` for display
// (the field WPForms itself uses; a future provider may differ), everything else round-trips
// through pull/push untouched.
export function getFormId(data: Record<string, unknown>): null | number {
  const id = Number(data.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function getFormTitle(data: Record<string, unknown>): string {
  const settings = data.settings as Record<string, unknown> | undefined
  const title = settings?.form_title
  return typeof title === 'string' && title.trim() !== '' ? title : '(untitled)'
}
