#!/usr/bin/env node
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'

import {registerProjectResources} from './resources/project.js'
import {registerAcfTools} from './tools/acf.js'
import {registerApiTools} from './tools/api.js'
import {registerAppTools} from './tools/app.js'
import {registerBulkTools} from './tools/bulk.js'
import {registerComposerTools} from './tools/composer.js'
import {registerFormTools} from './tools/form.js'
import {registerHookTools} from './tools/hooks.js'
import {registerOptionTools} from './tools/option.js'
import {registerPluginTools} from './tools/plugin.js'
import {registerSeoTools} from './tools/seo.js'
import {registerSnippetTools} from './tools/snippet.js'
import {registerStatusTools} from './tools/status.js'
import {registerThemeTools} from './tools/theme.js'

const server = new McpServer({name: 'loopress', version: '0.1.0'})

registerSnippetTools(server)
registerApiTools(server)
registerHookTools(server)
registerAppTools(server)
registerAcfTools(server)
registerSeoTools(server)
registerOptionTools(server)
registerFormTools(server)
registerPluginTools(server)
registerThemeTools(server)
registerComposerTools(server)
registerBulkTools(server)
registerStatusTools(server)
registerProjectResources(server)

const transport = new StdioServerTransport()
await server.connect(transport)
