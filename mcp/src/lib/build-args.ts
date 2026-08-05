export function buildArgs(base: string[], input: {env?: string; path?: string}): string[] {
  const args = [...base]
  if (input.path) args.push(input.path)
  if (input.env) args.push('--env', input.env)
  return args
}
