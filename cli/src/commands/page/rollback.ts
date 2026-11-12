import {isRecord} from '../../lib/narrow.js'
import {resourceRollbackCommand} from '../../lib/rollback-command.js'
import {PAGES_ENDPOINT} from '../../utils/page-format.js'

// `page push` takes a slug, not a directory, so the snapshot is written back page by page with
// the same PUT. `adopt`: like the --overwrite a delegated push gets, the drift check already asked.
export default resourceRollbackCommand('page', {
  description: 'Restore static pages to a snapshot taken automatically before an earlier `lps page push`',
  pathNoun: 'pages directory',
  async restore({ids, snapshot, wp}) {
    for (const slug of ids) {
      const page = snapshot.beforeState[slug]
      if (!isRecord(page)) throw new Error(`Snapshot entry "${slug}" is not an object.`)
      // A header field equal to its default is left out of the snapshot (resource-state.ts's canonicalPage).
      await wp.put(PAGES_ENDPOINT, {fullWidth: false, hideTitle: false, template: '', ...page, adopt: true, slug})
    }
  },
})
