import {createHash} from 'node:crypto'
import {z} from 'zod'

import {CHILD_THEME_ENDPOINT, type ChildTheme} from '../utils/template-format.js'
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
// CSS file, or a bundle of the previous snapshot the site still has exactly the files of: the
// one that push sent, or the one before it (put back by a rollback since). Undefined otherwise: a plugin too old to report hashes, CSS written from
// another machine or since edited.
export function cssBeforePush(beforeState: ResourceState, siteReportsCss: boolean, previous: Snapshot | undefined): ThemeCss | undefined {
  if (!siteReportsCss) return undefined
  const before = cssEntries(beforeState)
  if (before.size === 0) return NO_CSS
  for (const candidate of [previous?.payload?.afterCss, previous?.payload?.beforeCss]) {
    const bundle = THEME_CSS.safeParse(candidate)
    if (bundle.success && sameState(cssHashState(bundle.data), before)) return bundle.data
  }

  return undefined
}

// Writes the snapshot's child theme back in one PUT, the same mirroring write as the push: a
// template or part the push added is removed. The CSS is the snapshot's copy of what the site had
// before the push, or, when the snapshot has none, the CSS that push sent (left as it is).
export const restoreChildTheme: RollbackRestore = async ({ids, snapshot, warn, wp}) => {
  const {stylesheet} = await wp.get<ChildTheme>(CHILD_THEME_ENDPOINT)
  const saved = snapshot.beforeState.stylesheet
  if (typeof saved === 'string' && saved !== stylesheet) {
    throw new Error(
      `This snapshot is of ${saved}, the child theme of the active theme is now ${stylesheet}: activate its parent again to roll it back.`,
    )
  }

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

  const child = await wp.put<ChildTheme>(CHILD_THEME_ENDPOINT, {...css, parts: files.parts, templates: files.templates})
  // The PUT only writes the child's files: a Site Editor copy keeps winning over them.
  if (child.customized.length > 0) {
    warn(
      `Edited in the Site Editor, their database copy still wins over the restored file: ${child.customized.join(', ')}. ` +
        'Clear their customizations in Appearance > Editor to see the restored version.',
    )
  }
}
