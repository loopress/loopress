#!/usr/bin/env node
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'

import {registerProjectResources} from './resources/project.js'
import {registerAcfTools} from './tools/acf.js'
import {registerApiTools} from './tools/api.js'
import {registerAppTools} from './tools/app.js'
import {registerBulkTools} from './tools/bulk.js'
import {registerComposerTools} from './tools/composer.js'
import {registerCptTools} from './tools/cpt.js'
import {registerDiffTools} from './tools/diff.js'
import {registerDoctorTools} from './tools/doctor.js'
import {registerFormTools} from './tools/form.js'
import {registerHookTools} from './tools/hooks.js'
import {registerMenuTools} from './tools/menu.js'
import {registerMetaTools} from './tools/meta.js'
import {registerOptionTools} from './tools/option.js'
import {registerPageTools} from './tools/page.js'
import {registerPatternTools} from './tools/pattern.js'
import {registerPluginTools} from './tools/plugin.js'
import {registerPromoteTools} from './tools/promote.js'
import {registerRoleTools} from './tools/role.js'
import {registerSnippetTools} from './tools/snippet.js'
import {registerStatusTools} from './tools/status.js'
import {registerTaxonomyTools} from './tools/taxonomy.js'
import {registerThemeTools} from './tools/theme.js'
import {registerThemeStylesTools} from './tools/theme-styles.js'
import {registerValidateTools} from './tools/validate.js'

const server = new McpServer({name: 'loopress', version: '0.1.0'})

registerSnippetTools(server)
registerApiTools(server)
registerHookTools(server)
registerPageTools(server)
registerAppTools(server)
registerAcfTools(server)
registerMenuTools(server)
registerCptTools(server)
registerTaxonomyTools(server)
registerMetaTools(server)
registerRoleTools(server)
registerPatternTools(server)
registerOptionTools(server)
registerFormTools(server)
registerPluginTools(server)
registerThemeTools(server)
registerThemeStylesTools(server)
registerComposerTools(server)
registerBulkTools(server)
registerPromoteTools(server)
registerStatusTools(server)
registerDiffTools(server)
registerDoctorTools(server)
registerValidateTools(server)
registerProjectResources(server)

const transport = new StdioServerTransport()
await server.connect(transport)
