#!/usr/bin/env node

import dotenvx from '@dotenvx/dotenvx'

dotenvx.config()

import {execute} from '@oclif/core'

await execute({dir: import.meta.url})
