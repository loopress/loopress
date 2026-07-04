import {compileFromFile} from 'json-schema-to-typescript'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const cliRoot = join(fileURLToPath(import.meta.url), '../..')

const schemas = [
  {out: 'src/types/project-config.generated.ts', schema: 'schemas/project-config.schema.json'},
  {out: 'src/types/global-config.generated.ts', schema: 'schemas/global-config.schema.json'},
  {out: 'src/types/snippet.generated.ts', schema: 'schemas/snippet.schema.json'},
]

for (const {out, schema} of schemas) {
  const banner = `// This file is generated from ${schema} by \`pnpm run schema:types\`. Do not edit by hand.\n\n`

  const ts = await compileFromFile(join(cliRoot, schema), {
    additionalProperties: false,
    bannerComment: '',
    style: {semi: false, singleQuote: true},
  })

  await writeFile(join(cliRoot, out), banner + ts)
}
