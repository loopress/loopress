import {type EnvironmentConfig} from '../types/config.js'

// One pushed item, with the value whose strings are scanned (HTML, block markup, an option's value).
export type ScannedItem = {id: string; value: unknown}

// `http(s)://` then the host, plain or JSON-escaped (`https:\/\/`), as block attributes and option
// values can hold either.
const ABSOLUTE_URL = /https?:(?:\/\/|\\\/\\\/)[^\s"'<>()\\]+/gi

// Warns, never rewrites: an absolute URL whose host is another environment of the project keeps
// pointing there once pushed (a staging link on production). A relative path, a link to the
// target environment itself and an external link are left alone.
export function environmentUrlWarnings(
  items: ScannedItem[],
  target: Pick<EnvironmentConfig, 'name' | 'url'>,
  environments: Array<Pick<EnvironmentConfig, 'name' | 'url'>>,
): string[] {
  const others = otherEnvironmentHosts(target, environments)
  if (others.size === 0) return []

  return items.flatMap((item) =>
    [...urlsByHost(item.value, others)].map(
      ([host, urls]) =>
        `${item.id} links to the "${others.get(host)}" environment (${host}), it will still point there on ${target.name}: ${[...urls].join(', ')}. ` +
        'Use a relative path (/about) instead.',
    ),
  )
}

// Host (with its port, so two local sites on one machine stay apart) to environment name.
function otherEnvironmentHosts(target: Pick<EnvironmentConfig, 'name' | 'url'>, environments: Array<Pick<EnvironmentConfig, 'name' | 'url'>>): Map<string, string> {
  const targetHost = hostOf(target.url)
  const others = new Map<string, string>()
  for (const env of environments) {
    const host = hostOf(env.url)
    if (host !== undefined && host !== targetHost && !others.has(host)) others.set(host, env.name)
  }

  return others
}

function urlsByHost(value: unknown, hosts: Map<string, string>): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>()
  for (const text of strings(value)) {
    for (const match of text.matchAll(ABSOLUTE_URL)) {
      const url = match[0].replaceAll(String.raw`\/`, '/')
      const host = hostOf(url)
      if (host === undefined || !hosts.has(host)) continue
      found.set(host, (found.get(host) ?? new Set()).add(url))
    }
  }

  return found
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host.toLowerCase() || undefined
  } catch {
    return undefined
  }
}

function* strings(value: unknown): Generator<string> {
  if (typeof value === 'string') {
    yield value
  } else if (Array.isArray(value)) {
    for (const entry of value) yield* strings(entry)
  } else if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) yield* strings(entry)
  }
}
