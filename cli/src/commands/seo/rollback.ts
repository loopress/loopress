import {resourceRollbackCommand} from '../../lib/rollback-command.js'

export default resourceRollbackCommand('seo', {
  description: 'Restore SEO settings, post meta, and redirects to a snapshot taken automatically before an earlier `lps seo push`',
  pathNoun: 'SEO directory',
})
