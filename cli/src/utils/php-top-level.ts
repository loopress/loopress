// Port of the plugin's ClassScanner::firstTopLevelSideEffect(): the first statement at the top
// level (brace depth 0) that would run when the file is loaded, or null when the file only
// declares things. The server rejects such a file at push ("code outside the class"); checking
// it here lets `lps validate` catch it first, a hand-written ABSPATH guard included (the plugin
// adds its own). PHP has no tokenizer in Node, so this is a minimal lexer: it only needs to skip
// comments, strings and heredocs correctly, and to see keywords, braces and ';'.
const ALLOWED = new Set(['abstract', 'class', 'const', 'declare', 'enum', 'final', 'function', 'interface', 'namespace', 'readonly', 'trait', 'use'])
const OPEN_TAG = /<\?php\b/i

type Token = {text: string; type: 'attribute' | 'html' | 'punct' | 'string' | 'word'}

// `depth`: open class/function bodies (the code in them runs only when called). A bracketed
// namespace's braces don't count, the statements in `namespace App { ... }` are top level too,
// so `braces` remembers which kind each open brace is (true: a namespace's).
type State = {atStart: boolean; braces: boolean[]; depth: number; namespaceHeader: boolean}

// Returns a short description of the offending token, for the error message.
export function firstTopLevelSideEffect(content: string): null | string {
  if (content.search(OPEN_TAG) !== 0) return 'inline HTML before <?php'

  const state: State = {atStart: true, braces: [], depth: 0, namespaceHeader: false}
  for (const token of lex(content.slice(5))) {
    const found = step(state, token)
    if (found !== null) return found
  }

  return null
}

// True when the file's first statement is `declare(strict_types=1);` (PHP refuses it anywhere
// else). A count of the text alone would also accept one that only sits in a comment.
export function startsWithStrictTypes(content: string): boolean {
  if (content.search(OPEN_TAG) !== 0) return false
  const texts: string[] = []
  for (const token of lex(content.slice(5))) {
    texts.push(token.text.toLowerCase())
    if (texts.length === 7) break
  }

  return texts.join('') === 'declare(strict_types=1);'
}

// Advances the brace depth and "a statement starts here" flag past one token; returns the token
// when it starts a top-level statement that isn't a declaration.
function step(state: State, token: Token): null | string {
  // A template inside a method (`?> <p>...</p> <?php`) only runs when the method is called.
  if (token.type === 'html') {
    if (state.depth > 0) return null
    state.atStart = true
    return token.text === '' ? null : 'inline HTML after ?>'
  }

  const statementStart = state.depth === 0 && state.atStart
  switch (token.text) {
    case ';': {
      if (state.depth === 0) {
        state.atStart = true
        state.namespaceHeader = false
      }

      return null
    }

    case '{': {
      return openBrace(state, statementStart)
    }

    case '}': {
      if (state.braces.pop() !== true) state.depth = Math.max(0, state.depth - 1)
      if (state.depth === 0) state.atStart = true
      return null
    }

    default: {
      if (!statementStart) return null
      state.atStart = false
      state.namespaceHeader = token.text.toLowerCase() === 'namespace'
      return isDeclaration(token) ? null : token.text
    }
  }
}

function openBrace(state: State, statementStart: boolean): null | string {
  if (state.namespaceHeader) {
    state.namespaceHeader = false
    state.braces.push(true)
    state.atStart = true
    return null
  }

  // A '{' starting a statement is a bare block, its body runs at load time.
  if (statementStart) return '{'
  state.braces.push(false)
  state.depth += 1
  return null
}

function isDeclaration(token: Token): boolean {
  return token.type === 'attribute' || (token.type === 'word' && ALLOWED.has(token.text.toLowerCase()))
}

function* lex(source: string): Generator<Token> {
  let i = skipTrivia(source, 0)
  while (i < source.length) {
    const [token, end] = readToken(source, i)
    yield token
    i = skipTrivia(source, end)
  }
}

// Skips whitespace and comments (`#[` is an attribute, not a comment).
function skipTrivia(source: string, start: number): number {
  let i = start
  for (;;) {
    if (/\s/.test(source[i] ?? '')) {
      i += 1
    } else if (source.startsWith('//', i) || (source[i] === '#' && source[i + 1] !== '[')) {
      // A line comment also ends at a closing tag, PHP outputs what follows it.
      const end = source.slice(i).search(/\n|\?>/)
      i = end === -1 ? source.length : i + end
    } else if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
    } else {
      return i
    }
  }
}

function readToken(source: string, i: number): [Token, number] {
  if (source.startsWith('?>', i)) {
    // Closing tag: everything up to the next <?php is output, but for one newline PHP eats.
    const next = source.slice(i + 2).search(OPEN_TAG)
    const html = next === -1 ? source.slice(i + 2) : source.slice(i + 2, i + 2 + next)
    return [{text: html.replace(/^\r?\n/, ''), type: 'html'}, next === -1 ? source.length : i + 2 + next + 5]
  }

  if (source.startsWith('#[', i)) return [{text: '#[', type: 'attribute'}, i + 2]
  if (source.startsWith('<<<', i) || `'"\``.includes(source[i])) {
    return [{text: source[i] === '`' ? '`' : 'a string', type: 'string'}, skipString(source, i)]
  }

  const word = /^[\w$\\]+/.exec(source.slice(i))
  if (word) return [{text: word[0], type: 'word'}, i + word[0].length]
  return [{text: source[i], type: 'punct'}, i + 1]
}

// Index right after the string (quoted, backtick, heredoc or nowdoc) starting at `i`.
function skipString(source: string, i: number): number {
  if (source[i] === '<') {
    const head = /^<<<[ \t]*(["']?)(\w+)\1\r?\n/.exec(source.slice(i))
    if (!head) return i + 3
    // PHP 7.3+: the closing identifier may be indented and followed by anything but a word char.
    const bodyStart = i + head[0].length - 1
    const close = new RegExp(String.raw`\n[ \t]*${head[2]}\b`).exec(source.slice(bodyStart))
    return close ? bodyStart + close.index + close[0].length : source.length
  }

  const quote = source[i]
  let j = i + 1
  while (j < source.length && source[j] !== quote) j += source[j] === '\\' ? 2 : 1
  return j + 1
}
