export function buildArgs(
  base: string[],
  input: {env?: string; path?: string; repeatFlags?: Record<string, string[] | undefined>},
): string[] {
  const args = [...base]
  if (input.path) args.push(input.path)
  if (input.env) args.push('--env', input.env)
  for (const [flag, values] of Object.entries(input.repeatFlags ?? {})) {
    for (const value of values ?? []) args.push(`--${flag}`, value)
  }

  return args
}
