import {resourceDiffCommand} from '../../lib/diff-command.js'

export default resourceDiffCommand('seo', {
  description:
    'Show what differs in SEO settings, post meta, and redirects between your local files and a WordPress environment, or between two environments',
  pathNoun: 'SEO directory',
})
