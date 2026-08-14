import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/snippet/pull.js'
import {findOrphanedFiles as findOrphanedFilesLib, numericPrefixKey} from '../../../src/lib/find-orphaned-files.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {buildMetaFile, buildSnippetFile, type NormalizedSnippet} from '../../../src/utils/snippet-format.js'
import {listrInstances, outputsOf, resetListrInstances, titlesOf} from '../../helpers/listr.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('listr2', async () => {
  const {createListrMock} = await import('../../helpers/listr.js')
  return createListrMock()
})

type PullInternals = {
  dryRun: boolean
  localConfig: LoopressLocalConfig
  removeOrphanedFiles(dir: string, orphans: string[], reason: string): Promise<void>
  siteConfig: EnvironmentConfig
  wpClient: {get: ReturnType<typeof vi.fn>}
}

// The same matcher `snippet pull` wires in run(): code extensions plus the json sidecar,
// identity taken from the `<id>-` prefix.
async function findOrphanedFiles(path: string, keepIds: Set<number>): Promise<string[]> {
  return findOrphanedFilesLib(path, new Set([...keepIds].map(String)), {
    extensions: ['.json', '.css', '.html', '.js', '.php', '.txt'],
    key: numericPrefixKey,
  })
}

const base: NormalizedSnippet = {
  active: false,
  code: '',
  description: '',
  id: 1,
  insertMethod: 'auto',
  location: 'everywhere',
  name: 'My Snippet',
  priority: 10,
  shortcodeAttributes: [],
  tags: [],
  type: 'php',
}

describe('pull helpers', () => {
  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds the code file and sidecar of a snippet no longer present remotely', async () => {
      writeFileSync(join(dir, '12-coucou.html'), 'hi')
      writeFileSync(join(dir, '12-coucou.json'), JSON.stringify({id: 12, name: 'coucou'}))

      const orphans = await findOrphanedFiles(dir, new Set())

      orphans.sort((a, b) => a.localeCompare(b))
      expect(orphans).toEqual(['12-coucou.html', '12-coucou.json'])
    })

    it('keeps files whose id is still in the current remote list', async () => {
      writeFileSync(join(dir, '10-just-demo.php'), '<?php echo 1;')
      writeFileSync(join(dir, '10-just-demo.json'), JSON.stringify({id: 10, name: 'Just demo'}))

      const orphans = await findOrphanedFiles(dir, new Set([10]))

      expect(orphans).toEqual([])
    })

    it('never touches a hand-created file with no numeric id prefix', async () => {
      writeFileSync(join(dir, 'demo.php'), '<?php echo 1;')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('ignores unrelated files in the snippets directory', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')
      writeFileSync(join(dir, '.DS_Store'), '')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('returns an empty list when the snippets directory does not exist yet', async () => {
      const orphans = await findOrphanedFiles(join(dir, 'does-not-exist'), new Set())

      expect(orphans).toEqual([])
    })
  })

  describe('run', () => {
    let runDir: string

    function make(dryRun: boolean, argv: string[]) {
      const cmd = new Pull(argv, fakeOclifConfig)
      const internals = cmd as unknown as PullInternals
      internals.dryRun = dryRun
      internals.localConfig = {}
      internals.siteConfig = makeEnv('production', 'https://acme.com')
      const logs = silenceLogs(cmd)
      const get = vi.fn()
      internals.wpClient = {get}
      return {cmd, get, internals, logs}
    }

    beforeEach(() => {
      resetListrInstances()
      runDir = mkdtempSync(join(tmpdir(), 'lps-snippet-pull-run-test-'))
    })

    afterEach(() => {
      rmSync(runDir, {force: true, recursive: true})
    })

    it('fetches loopress/v1/snippets and logs the banner lines', async () => {
      const {cmd, get, logs} = make(false, [runDir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/snippets')
      expect(logs.log).toHaveBeenCalledWith('Pulling snippets from https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`Snippets path: ${runDir}`)
    })

    it('writes a snippet to <id>-<slug>.<ext> and <id>-<slug>.json, and reports the Listr title/output', async () => {
      const {cmd, get, logs} = make(false, [runDir])
      get.mockResolvedValue([{active: true, code: "echo 'hi';", id: 7, location: 'everywhere', name: 'My Snippet', type: 'php'}])

      const result = await cmd.run()

      expect(readFileSync(join(runDir, '7-my-snippet.php'), 'utf8')).toBe("<?php\n\necho 'hi';")
      const meta = JSON.parse(readFileSync(join(runDir, '7-my-snippet.json'), 'utf8'))
      expect(meta).toEqual({active: true, id: 7, location: 'everywhere', name: 'My Snippet', type: 'php'})
      expect(titlesOf(0)).toEqual(['Pull My Snippet'])
      expect(outputsOf(0)).toEqual(['Pulled: My Snippet'])
      expect(logs.log).toHaveBeenCalledWith('Pulled 1 snippet to ' + runDir)
      expect(result).toEqual({orphans: [], pulled: [{id: 7, name: 'My Snippet'}], skipped: 0, status: 'success'})
    })

    it('writes the correct extension per snippet type', async () => {
      const {cmd, get} = make(false, [runDir])
      get.mockResolvedValue([
        {code: 'body{}', id: 1, name: 'Style', type: 'css'},
        {code: '<div>hi</div>', id: 2, name: 'Markup', type: 'html'},
        {code: 'console.log(1)', id: 3, name: 'Script', type: 'js'},
        {code: 'plain text', id: 4, name: 'Note', type: 'text'},
      ])

      await cmd.run()

      expect(existsSync(join(runDir, '1-style.css'))).toBe(true)
      expect(existsSync(join(runDir, '2-markup.html'))).toBe(true)
      expect(existsSync(join(runDir, '3-script.js'))).toBe(true)
      expect(existsSync(join(runDir, '4-note.txt'))).toBe(true)
    })

    it('pluralizes the final summary for more than one snippet', async () => {
      const {cmd, get, logs} = make(false, [runDir])
      get.mockResolvedValue([
        {code: 'a', id: 1, name: 'A', type: 'text'},
        {code: 'b', id: 2, name: 'B', type: 'text'},
      ])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('Pulled 2 snippets to ' + runDir)
    })

    it('skips a snippet with a blank name and warns with the exact singular count, without writing it', async () => {
      const {cmd, get, logs} = make(false, [runDir])
      get.mockResolvedValue([{code: 'a', id: 1, name: 'Real', type: 'text'}, {code: 'b', id: 2, name: ' '.repeat(3), type: 'text'}])

      await cmd.run()

      expect(logs.warn).toHaveBeenCalledWith('1 snippet skipped because they have no name')
      expect(existsSync(join(runDir, '1-real.txt'))).toBe(true)
      expect(existsSync(join(runDir, '2.txt'))).toBe(false)
    })

    it('pluralizes the skip warning for more than one skipped snippet', async () => {
      const {cmd, get, logs} = make(false, [runDir])
      get.mockResolvedValue([{code: 'a', id: 1, name: '', type: 'text'}, {code: 'b', id: 2, name: '', type: 'text'}])

      await cmd.run()

      expect(logs.warn).toHaveBeenCalledWith('2 snippets skipped because they have no name')
    })

    it('does not warn when every snippet has a name', async () => {
      const {cmd, get, logs} = make(false, [runDir])
      get.mockResolvedValue([{code: 'a', id: 1, name: 'Real', type: 'text'}])

      await cmd.run()

      expect(logs.warn).not.toHaveBeenCalled()
    })

    it('creates the snippets directory unconditionally, even when there is nothing to pull', async () => {
      const snippetsDir = join(runDir, 'snippets')
      const {cmd, get} = make(false, [snippetsDir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(existsSync(snippetsDir)).toBe(true)
    })

    it('wires removeOrphanedFiles with the path, the exact orphan list, and the reason', async () => {
      writeFileSync(join(runDir, '5-gone.php'), '<?php')
      writeFileSync(join(runDir, '5-gone.json'), '{}')
      writeFileSync(join(runDir, '7-my-snippet.php'), '<?php')
      writeFileSync(join(runDir, '7-my-snippet.json'), '{}')
      const {cmd, get, internals} = make(false, [runDir])
      get.mockResolvedValue([{code: "echo 'hi';", id: 7, name: 'My Snippet', type: 'php'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles').mockResolvedValue(undefined)

      await cmd.run()

      const [[calledDir, orphans, reason]]: [[string, string[], string]] = removeOrphanedFiles.mock.calls
      expect(calledDir).toBe(runDir)
      const sortedOrphans = [...orphans]
      sortedOrphans.sort((a, b) => a.localeCompare(b))
      expect(sortedOrphans).toEqual(['5-gone.json', '5-gone.php'])
      expect(reason).toBe('whose snippet no longer exists on WordPress')
    })

    it('does nothing on dry-run: no items written, no removal, correct dry-run message and result', async () => {
      const {cmd, get, internals, logs} = make(true, [runDir])
      get.mockResolvedValue([{code: "echo 'hi';", id: 7, name: 'My Snippet', type: 'php'}])
      const removeOrphanedFiles = vi.spyOn(internals, 'removeOrphanedFiles')

      const result = await cmd.run()

      expect(existsSync(join(runDir, '7-my-snippet.php'))).toBe(false)
      expect(removeOrphanedFiles).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 1 snippet to ' + runDir)
      expect(result).toEqual({orphans: [], pulled: [{id: 7, name: 'My Snippet'}], skipped: 0, status: 'dry-run'})
    })

    // Regression coverage: the dry-run "Would pull" count is taken from the *total* fetched
    // snippets (before the blank-name filter), unlike the real-run "Pulled" summary which
    // counts only the pullable ones. A dry run with an unnamed snippet in the mix therefore
    // promises to pull one more item than a real run of the same data actually would.
    it('counts the dry-run "Would pull" message from every fetched snippet, including ones that would later be skipped', async () => {
      const {cmd, get, logs} = make(true, [runDir])
      get.mockResolvedValue([{code: 'a', id: 1, name: 'Real', type: 'text'}, {code: 'b', id: 2, name: ' '.repeat(3), type: 'text'}])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 2 snippets to ' + runDir)
    })

    it('pluralizes the dry-run "Would pull" message for more than one snippet', async () => {
      const {cmd, get, logs} = make(true, [runDir])
      get.mockResolvedValue([
        {code: 'a', id: 1, name: 'A', type: 'text'},
        {code: 'b', id: 2, name: 'B', type: 'text'},
      ])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would pull 2 snippets to ' + runDir)
    })

    it('reports would-remove with singular wording for exactly one orphan on dry-run, without deleting it', async () => {
      writeFileSync(join(runDir, '5-gone.php'), '<?php')
      const {cmd, get, logs} = make(true, [runDir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(`[dry-run] Would remove 1 local file whose snippet no longer exists on WordPress: 5-gone.php`)
      expect(existsSync(join(runDir, '5-gone.php'))).toBe(true)
    })

    it('reports would-remove with a comma-separated, pluralized list for more than one orphan on dry-run', async () => {
      writeFileSync(join(runDir, '5-gone.php'), '<?php')
      writeFileSync(join(runDir, '5-gone.json'), '{}')
      const {cmd, get, logs} = make(true, [runDir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(
        `[dry-run] Would remove 2 local files whose snippet no longer exists on WordPress: 5-gone.json, 5-gone.php`,
      )
    })

    it('does not log a would-remove line on dry-run when there are no orphans', async () => {
      const {cmd, get, logs} = make(true, [runDir])
      get.mockResolvedValue([])

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Would remove'))
    })

    it('uses the silent Listr renderer when --json is passed, the default renderer otherwise', async () => {
      const {cmd: jsonCmd, get: jsonGet} = make(false, [runDir, '--json'])
      jsonGet.mockResolvedValue([{code: 'a', id: 1, name: 'A', type: 'text'}])
      await jsonCmd.run()

      expect(listrInstances.at(-1)?.options).toEqual({renderer: 'silent'})

      const {cmd: plainCmd, get: plainGet} = make(false, [runDir])
      plainGet.mockResolvedValue([{code: 'a', id: 1, name: 'A', type: 'text'}])
      await plainCmd.run()

      expect(listrInstances.at(-1)?.options).toEqual({renderer: 'default'})
    })
  })

  describe('buildSnippetFile', () => {
    it('prepends <?php when PHP code has no opening tag', () => {
      const snippet = {...base, code: "add_filter('x', 'y');"}
      expect(buildSnippetFile(snippet)).toBe("<?php\n\nadd_filter('x', 'y');")
    })

    it('does not double-add <?php when code already has it', () => {
      const snippet = {...base, code: "<?php\nadd_filter('x', 'y');"}
      expect(buildSnippetFile(snippet)).toBe("<?php\nadd_filter('x', 'y');")
    })

    it('does not add <?php for non-PHP types', () => {
      const snippet: NormalizedSnippet = {...base, type: 'css', code: 'body { margin: 0; }'}
      expect(buildSnippetFile(snippet)).toBe('body { margin: 0; }')
    })

    it('returns code as-is for js type', () => {
      const snippet: NormalizedSnippet = {...base, type: 'js', code: 'console.log(1)'}
      expect(buildSnippetFile(snippet)).toBe('console.log(1)')
    })

    it('returns code as-is for html type', () => {
      const snippet: NormalizedSnippet = {...base, type: 'html', code: '<div>hi</div>'}
      expect(buildSnippetFile(snippet)).toBe('<div>hi</div>')
    })
  })

  describe('buildMetaFile', () => {
    it('includes required fields', () => {
      const meta = JSON.parse(buildMetaFile(base))
      expect(meta.id).toBe(1)
      expect(meta.name).toBe('My Snippet')
      expect(meta.type).toBe('php')
      expect(meta.active).toBe(false)
      expect(meta.location).toBe('everywhere')
    })

    it('omits description when empty', () => {
      const meta = JSON.parse(buildMetaFile({...base, description: ''}))
      expect(meta).not.toHaveProperty('description')
    })

    it('includes description when present', () => {
      const meta = JSON.parse(buildMetaFile({...base, description: 'A description'}))
      expect(meta.description).toBe('A description')
    })

    it('omits tags when empty', () => {
      const meta = JSON.parse(buildMetaFile({...base, tags: []}))
      expect(meta).not.toHaveProperty('tags')
    })

    it('includes tags when present', () => {
      const meta = JSON.parse(buildMetaFile({...base, tags: ['sample', 'dates']}))
      expect(meta.tags).toEqual(['sample', 'dates'])
    })

    it('omits insertMethod when it is the default "auto"', () => {
      const meta = JSON.parse(buildMetaFile({...base, insertMethod: 'auto'}))
      expect(meta).not.toHaveProperty('insertMethod')
    })

    it('includes insertMethod when it is "shortcode"', () => {
      const meta = JSON.parse(buildMetaFile({...base, insertMethod: 'shortcode'}))
      expect(meta.insertMethod).toBe('shortcode')
    })

    it('omits priority when it is the default 10', () => {
      const meta = JSON.parse(buildMetaFile({...base, priority: 10}))
      expect(meta).not.toHaveProperty('priority')
    })

    it('includes priority when it differs from the default', () => {
      const meta = JSON.parse(buildMetaFile({...base, priority: 20}))
      expect(meta.priority).toBe(20)
    })

    it('omits shortcodeAttributes when empty', () => {
      const meta = JSON.parse(buildMetaFile({...base, shortcodeAttributes: []}))
      expect(meta).not.toHaveProperty('shortcodeAttributes')
    })

    it('includes shortcodeAttributes when present', () => {
      const meta = JSON.parse(buildMetaFile({...base, shortcodeAttributes: ['color', 'size']}))
      expect(meta.shortcodeAttributes).toEqual(['color', 'size'])
    })

    it('produces valid JSON ending with a newline', () => {
      const output = buildMetaFile(base)
      expect(() => JSON.parse(output)).not.toThrow()
      expect(output.endsWith('\n')).toBe(true)
    })
  })
})
