import {createHash} from 'node:crypto'
import {z} from 'zod'

import {CHILD_THEME_ENDPOINT} from '../utils/template-format.js'
import {type ThemeCss} from '../utils/theme-css.js'
import {type ResourceState} from './diff-state.js'
import {isRecord} from './narrow.js'
import {type RollbackRestore} from './rollback-command.js'
import {type Snapshot} from './snapshot-store.js'

// The snapshot resource of `lps theme template push`, see resource-state.ts's childThemeProvider.
export const CHILD_THEME_RESOURCE = 'theme-template'

const THEME_ASSET = z.object({content: z.string(), path: z.string()})
const BLOCK_STYLE = z.object({css: z.string(), name: z.string()})
const THEME_CSS = z.object({assets: z.array(THEME_ASSET), blocks: z.array(BLOCK_STYLE), style: z.string()})

const NO_CSS: ThemeCss = {assets: [], blocks: [], style: ''}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

// The hashes the site reports for this bundle once pushed (ChildThemeController::cssHashes),
// keyed like childThemeSnapshotState's CSS entries.
export function cssHashState(css: ThemeCss): ResourceState {
  const state: ResourceState = new Map()
  if (css.style !== '') state.set('css/style.css', sha256(css.style))
  for (const block of css.blocks) state.set(`css/blocks/${block.name}.css`, sha256(block.css))
  return state
}

function cssEntries(state: ResourceState): ResourceState {
  return new Map([...state].filter(([id]) => id.startsWith('css/')))
}

function sameState(a: ResourceState, b: ResourceState): boolean {
  return a.size === b.size && [...a].every(([id, value]) => b.get(id) === value)
}

// The CSS the site had right before a push, when it can be told: none when the site reports no
// CSS file, or the bundle the previous push from this machine sent when the site still has
// exactly those files. Undefined otherwise: a plugin too old to report hashes, CSS written from
// another machine or since edited.
export function cssBeforePush(beforeState: ResourceState, siteReportsCss: boolean, previous: Snapshot | undefined): ThemeCss | undefined {
  if (!siteReportsCss) return undefined
  const before = cssEntries(beforeState)
  if (before.size === 0) return NO_CSS
  const pushed = THEME_CSS.safeParse(previous?.payload?.afterCss)
  return pushed.success && sameState(cssHashState(pushed.data), before) ? pushed.data : undefined
}

// Writes the snapshot's child theme back in one PUT, the same mirroring write as the push: a
// template or part the push added is removed. The CSS is the snapshot's copy of what the site had
// before the push, or, when the snapshot has none, the CSS that push sent (left as it is).
export const restoreChildTheme: RollbackRestore = async ({ids, snapshot, warn, wp}) => {
  const files: Record<'parts' | 'templates', Array<Record<string, unknown>>> = {parts: [], templates: []}
  for (const id of ids) {
    const separator = id.indexOf('/')
    const kind = id.slice(0, separator)
    const raw = snapshot.beforeState[id]
    // `siteEditor` is the Site Editor marker childThemeFiles adds, not a field of the file.
    const value = isRecord(raw) ? Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'siteEditor')) : {}
    // A Site Editor customization with no file on the child theme: nothing to write back.
    if ((kind === 'parts' || kind === 'templates') && typeof value.html === 'string') {
      files[kind].push({...value, slug: id.slice(separator + 1)})
    }
  }

  const before = THEME_CSS.safeParse(snapshot.payload?.beforeCss)
  let css: ThemeCss
  if (before.success) {
    css = before.data
  } else {
    const pushed = THEME_CSS.safeParse(snapshot.payload?.afterCss)
    if (!pushed.success) throw new Error('This snapshot holds no copy of the theme CSS: restoring it would remove the CSS from the site.')
    css = pushed.data
    warn(
      'The theme CSS is not restored: this snapshot has no copy of the CSS the site had before that push (the first CSS push from this machine, ' +
        'or CSS pushed from somewhere else since). It keeps the CSS that push sent.',
    )
  }

  await wp.put(CHILD_THEME_ENDPOINT, {...css, parts: files.parts, templates: files.templates})
}
