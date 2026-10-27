import {type SnippetInsertMethod, type SnippetLocation, type SnippetType} from '../utils/snippet-format.js'

export type Snippet = {
  active: boolean
  code: string
  description?: string | undefined
  id?: number | undefined
  insertMethod: SnippetInsertMethod
  location: SnippetLocation
  name: string
  path: string
  priority: number
  shortcodeAttributes: string[]
  tags: string[]
  type: SnippetType
}
