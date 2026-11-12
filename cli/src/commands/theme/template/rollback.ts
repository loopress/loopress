import {CHILD_THEME_RESOURCE, restoreChildTheme} from '../../../lib/child-theme-snapshot.js'
import {childThemeProvider} from '../../../lib/resource-state.js'
import {resourceRollbackCommand} from '../../../lib/rollback-command.js'

export default resourceRollbackCommand(CHILD_THEME_RESOURCE, {
  command: 'theme template',
  description:
    'Restore the Loopress child theme (templates, parts and theme CSS) to a snapshot taken automatically before an earlier `lps theme template push`. Like the push, it mirrors the snapshot: a template or part the push added is removed.',
  mirror: true,
  pathNoun: 'templates directory',
  provider: childThemeProvider,
  restore: restoreChildTheme,
})
