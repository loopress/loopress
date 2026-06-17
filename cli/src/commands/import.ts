import {Args, Command, Flags} from '@oclif/core'
import got from 'got'

import {WordpressDXCommand} from './base.js'

export default class Import extends WordpressDXCommand {
  static args = {
    file: Args.string({description: 'Input file path', required: true}),
  }
  static description = 'Import CodeSnippets from a file'
  static examples = [
    '$ wdx import --file snippets.json',
    '$ wdx import --file snippets.json --url http://example.com',
  ]
  static flags = {
    ...WordpressDXCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
    force: Flags.boolean({char: 'f', description: 'Force overwrite existing snippets'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Import)
    const {dryRun, force, password, url, user} = flags as {
      dryRun: boolean
      force: boolean
      password: string
      url: string
      user: string
    }
    const {file} = args

    this.log(`📥 Importing CodeSnippets from ${file}`)
    this.log(`👤 User: ${user}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    try {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(file, 'utf8')
      let snippets: any

      try {
        snippets = JSON.parse(content)
      } catch {
        snippets = this.parsePHPFile(content)
      }

      if (dryRun) {
        this.log(`📝 [DRY RUN] Would import ${Array.isArray(snippets) ? snippets.length : 'snippets'}`)
        return
      }

      const endpoint = `${url}/wp-json/code-snippets/v1/snippets`
      const auth = Buffer.from(`${user}:${password}`).toString('base64')
      let count = 0

      if (Array.isArray(snippets)) {
        for (const snippet of snippets) {
          const existingSnippets: any = await got
            .get(endpoint, {
              headers: {
                Authorization: `Basic ${auth}`,
              },
            })
            .json()

          const existingSnippet = existingSnippets.find((s: any) => s.name === snippet.name)

          if (existingSnippet && !force) {
            this.log(`⏭️  Skipping existing: ${snippet.name}`)
            continue
          }

          await (existingSnippet && force
            ? got.put(`${endpoint}/${existingSnippet.id}`, {
                headers: {
                  Authorization: `Basic ${auth}`,
                },
                json: {
                  code: snippet.code,
                  desc: snippet.desc || `Imported from ${file}`,
                  name: snippet.name,
                  tags: snippet.tags || [],
                },
              })
            : got.post(endpoint, {
                headers: {
                  Authorization: `Basic ${auth}`,
                },
                json: {
                  code: snippet.code,
                  desc: snippet.desc || `Imported from ${file}`,
                  name: snippet.name,
                  tags: snippet.tags || [],
                },
              }))

          count++
          this.log(`✅ ${existingSnippet ? 'Updated' : 'Created'}: ${snippet.name}`)
        }
      } else {
        for (const [name, data] of Object.entries(snippets)) {
          const existingSnippets: any = await got
            .get(endpoint, {
              headers: {
                Authorization: `Basic ${auth}`,
              },
            })
            .json()

          const existingSnippet = existingSnippets.find((s: any) => s.name === name)

          if (existingSnippet && !force) {
            this.log(`⏭️  Skipping existing: ${name}`)
            continue
          }

          const snippetData = data as {code?: string; desc?: string; tags?: string[]}

          await (existingSnippet && force
            ? got.put(`${endpoint}/${existingSnippet.id}`, {
                headers: {
                  Authorization: `Basic ${auth}`,
                },
                json: {
                  code: snippetData.code,
                  desc: snippetData.desc || `Imported from ${file}`,
                  name,
                  tags: snippetData.tags || [],
                },
              })
            : got.post(endpoint, {
                headers: {
                  Authorization: `Basic ${auth}`,
                },
                json: {
                  code: snippetData.code,
                  desc: snippetData.desc || `Imported from ${file}`,
                  name,
                  tags: snippetData.tags || [],
                },
              }))

          count++
          this.log(`✅ ${existingSnippet ? 'Updated' : 'Created'}: ${name}`)
        }
      }

      this.log(`🎉 Successfully imported ${count} snippet${count === 1 ? '' : 's'}`)
    } catch (error) {
      this.error(`❌ Error importing snippets: ${(error as Error).message}`)
    }
  }

  private parsePHPFile(content: string): Record<string, any> {
    const result: Record<string, any> = {}
    const regex = /'([^']+)'\s*=>\s*\[[\s\S]*?code\s*=>\s*<<<PHP\n([\s\S]*?)\nPHP,([\s\S]*?)\],/g
    let match

    while ((match = regex.exec(content)) !== null) {
      const name = match[1]
      const code = match[2]
      const rest = match[3]

      result[name] = {
        active: false,
        code,
        tags: [],
      }
    }

    return result
  }
}
