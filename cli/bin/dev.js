#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import dotenvx from '@dotenvx/dotenvx'

dotenvx.config()

import {execute} from '@oclif/core'

await execute({development: true, dir: import.meta.url})
