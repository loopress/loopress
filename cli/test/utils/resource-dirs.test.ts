import {join} from 'node:path'
import {describe, expect, it} from 'vitest'

import {resolveResourceDir, RESOURCE_DIR_DEFAULTS} from '../../src/utils/resource-dirs.js'

describe('resolveResourceDir', () => {
  it('prefers an explicit override, as given', () => {
    expect(resolveResourceDir('snippets', {rootDir: 'site', snippetsDir: 'code'}, './elsewhere')).toBe('./elsewhere')
  })

  it('uses the loopress.json <kind>Dir setting under rootDir', () => {
    expect(resolveResourceDir('form', {formDir: 'my-forms', rootDir: 'site'})).toBe(join('site', 'my-forms'))
  })

  it('falls back to the default directory under rootDir', () => {
    expect(resolveResourceDir('themeStyles', {rootDir: 'site'})).toBe(join('site', 'theme'))
  })

  it('treats a missing rootDir as the current directory', () => {
    expect(resolveResourceDir('menu', {})).toBe('menus')
  })

  it.each([
    ['acf', 'acfDir'],
    ['api', 'apiDir'],
    ['apps', 'appsDir'],
    ['form', 'formDir'],
    ['hooks', 'hooksDir'],
    ['menu', 'menuDir'],
    ['options', 'optionsDir'],
    ['page', 'pageDir'],
    ['seo', 'seoDir'],
    ['snippets', 'snippetsDir'],
    ['template', 'templateDir'],
    ['themeStyles', 'themeStylesDir'],
  ] as const)('reads %s from loopress.json "%s"', (kind, key) => {
    expect(resolveResourceDir(kind, {[key]: 'custom', rootDir: 'r'})).toBe(join('r', 'custom'))
  })

  it('has the documented defaults', () => {
    expect(RESOURCE_DIR_DEFAULTS).toEqual({
      acf: 'acf',
      api: 'api',
      apps: 'apps',
      form: 'forms',
      hooks: 'hooks',
      menu: 'menus',
      options: 'options',
      page: 'pages',
      seo: 'seo',
      snippets: 'snippets',
      template: 'templates',
      themeStyles: 'theme',
    })
  })
})
