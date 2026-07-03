import {SnippetInsertMethod, SnippetLocation, SnippetType} from '../utils/snippet-plugin.js'

export interface Snippet {
  active: boolean
  code: string
  id?: number
  insertMethod: SnippetInsertMethod
  location: SnippetLocation
  name: string
  path: string
  priority: number
  shortcodeAttributes: string[]
  tags: string[]
  type: SnippetType
}
