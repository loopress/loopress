export const FORM_ENDPOINT = 'loopress/v1/forms'

export function formEndpoint(id: number): string {
  return `${FORM_ENDPOINT}/${id}`
}

// Deliberately loose, same reasoning as getAcfKey in acf-format.ts: a form plugin's own data
// format (WPForms today: fields, settings, notifications, confirmations, providers, meta; other
// WordPress form plugins may be supported later, same shape as snippet-format.ts's Code
// Snippets/WPCode split) is large, deeply nested, and versioned by whichever plugin release
// wrote it. We only need `id` for filenames/identity and `settings.form_title` for display
// (the field WPForms itself uses; a future provider may differ), everything else round-trips
// through pull/push untouched.
//
// `RemoteForm` describes the one extra field `GET /forms/{id}` and `PUT /forms/{id}` add on top
// of that same loosely-typed shape: an opaque content hash of the form's current state (mirrors
// RemoteOption.revision in option-format.ts, #234's form equivalent), only ever compared for
// equality by `form push`'s conditional-write precondition. Never persisted locally, same as
// RemoteOption.revision: a local file describes the desired state, not remote bookkeeping.
export type RemoteForm = Record<string, unknown> & {
  revision: string
}

export function getFormId(data: Record<string, unknown>): null | number {
  const id = Number(data.id)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function getFormTitle(data: Record<string, unknown>): string {
  const settings = data.settings as Record<string, unknown> | undefined
  const title = settings?.form_title
  return typeof title === 'string' && title.trim() !== '' ? title : '(untitled)'
}
