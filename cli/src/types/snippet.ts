import {SnippetType} from '../utils/snippet-plugin.js'

export interface Snippet {
  code: string
  id?: number
  name: string
  path: string
  type: SnippetType
}
