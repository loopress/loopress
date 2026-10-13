// Plain values and functions shared by every panel, see ui.tsx for the components.

// Follows the admin color scheme the user picked in their profile.
export const ACCENT = 'var(--wp-admin-theme-color, #3858e9)';
export const MUTED = '#646970';

export const CELL: React.CSSProperties = { padding: 8, verticalAlign: 'top' };
export const MONO: React.CSSProperties = { ...CELL, fontFamily: 'monospace', color: ACCENT };

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
];

// "3 hours ago" / "in 20 minutes", the full date stays available as a tooltip at call sites.
export function timeAgo(iso: string, now = Date.now()): string {
    const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
    if (Number.isNaN(seconds)) return iso;

    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [unit, size] of UNITS) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }
    return seconds < 0 ? 'just now' : 'in less than a minute';
}

export function isProduction(): boolean {
    return window.loopressData?.environment === 'production';
}

// Native confirm(), like WordPress core's own delete prompts. Without `always`, only asks on a
// production site: there, a wp-admin change is the one most likely to drift from the repo.
export function confirmChange(message: string, always = false): boolean {
    if (isProduction()) return window.confirm(`This is the PRODUCTION site.\n\n${message}`);
    return always ? window.confirm(message) : true;
}

export type PhpToken = { text: string; kind: 'comment' | 'attribute' | 'string' | 'variable' | 'keyword' | 'tag' | 'number' | null };

// Order matters: a comment or a string swallows whatever looks like code inside it.
const PHP_TOKENS = new RegExp([
    String.raw`(?<comment>\/\/.*|#(?!\[).*|\/\*[\s\S]*?\*\/)`,
    String.raw`(?<attribute>#\[[^\]]*\])`,
    String.raw`(?<string>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")`,
    String.raw`(?<variable>\$[A-Za-z_]\w*)`,
    String.raw`(?<tag><\?php|\?>)`,
    String.raw`(?<keyword>\b(?:abstract|array|as|bool|break|callable|case|catch|class|const|continue|declare|default|do|echo|else|elseif|enum|extends|false|final|float|fn|for|foreach|function|global|if|implements|instanceof|int|interface|iterable|match|mixed|namespace|never|new|null|object|parent|private|protected|public|readonly|return|self|static|string|switch|throw|trait|true|try|use|void|while|yield)\b)`,
    String.raw`(?<number>\b\d+(?:\.\d+)?\b)`,
].join('|'), 'g');

// Just enough PHP highlighting for the source drawer: a full grammar would be a dependency
// for files that are read, never edited, here.
export function highlightPhp(code: string): PhpToken[] {
    const tokens: PhpToken[] = [];
    let last = 0;
    for (const match of code.matchAll(PHP_TOKENS)) {
        if (match.index > last) tokens.push({ text: code.slice(last, match.index), kind: null });
        const kind = Object.entries(match.groups ?? {}).find(([, value]) => value !== undefined)?.[0] as PhpToken['kind'];
        tokens.push({ text: match[0], kind });
        last = match.index + match[0].length;
    }
    if (last < code.length) tokens.push({ text: code.slice(last), kind: null });
    return tokens;
}
