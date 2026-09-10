<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Management endpoint behind `lps <resource> push`/`pull`/`list`: GET lists every file under
 * an AbstractFilesDirectory with its guard stripped, PUT validates and writes one file
 * (declare(strict_types=1) enforced by FileWriter, `php -l` syntax check, exactly one class,
 * no name collision). Distinct from whatever the pushed file itself exposes at boot (see the
 * matching loader). Concrete subclasses pick only the route path and the filename pattern;
 * the 'api'/'hooks' label and the load-errors option come from the injected directory.
 */
abstract class AbstractFilesController
{
    use RequiresManageOptionsCapability;

    // The files directory, typed to its concrete subclass by each controller so PHP-DI
    // autowires the right one.
    abstract protected function directory(): AbstractFilesDirectory;

    /**
     * The path passed to register_rest_route() under loopress/v1, e.g. '/api-files'.
     *
     * @return non-falsy-string
     */
    abstract protected function routePath(): string;

    // A slash-separated path of segments, no path traversal (no '.' anywhere), extension
    // never taken from the client. Returned rather than a const so a subclass can't ship an
    // empty pattern by omission, and so the static analysers don't lint a placeholder regex
    // on the base.
    /** @return non-empty-string a PCRE pattern for preg_match() */
    abstract protected static function filenamePattern(): string;

    // The path prefix in every "…already declared by <label>/<slug>.php" message and the
    // tempnam() prefix in checkSyntax(): 'api', 'hooks', … , from the injected directory.
    private function label(): string
    {
        return $this->directory()::SUBDIR;
    }

    public function register_routes(): void
    {
        // filename is a body arg, not a URL path param: a nested slug can contain '/' and
        // '[]', and embedding those in a URL path segment would depend on the target server
        // correctly handling percent-encoded slashes (Apache rejects %2F by default unless
        // AllowEncodedSlashes is set; nginx has its own equivalent quirks), exactly the kind
        // of hosting-environment variance Loopress can't assume away. A body param sidesteps
        // it entirely, same as 'content' already does.
        register_rest_route('loopress/v1', $this->routePath(), [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_files'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'push_file'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'filename' => [
                        'required'          => true,
                        'validate_callback' => static::isValidFilename(...),
                    ],
                    'content' => [
                        'required' => true,
                        'type'     => 'string',
                    ],
                ],
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_file'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    // Sent in the query string, not the body: a DELETE has no body in every
                    // HTTP stack, and a nested slug's '/' and '[]' are safe there (unlike a
                    // URL path segment, the reason push_file() takes 'filename' in the body).
                    'filename' => [
                        'required'          => true,
                        'validate_callback' => static::isValidFilename(...),
                    ],
                ],
            ],
        ]);
    }

    // Public and static, so it's directly unit-testable rather than only reachable through a
    // real WP REST dispatch. static:: throughout so a subclass overriding either this or
    // filenamePattern() (see HookFilesController) is honoured from register_routes() too.
    public static function isValidFilename(mixed $value): bool
    {
        return is_string($value) && preg_match(static::filenamePattern(), $value) === 1;
    }

    public function list_files(): WP_REST_Response
    {
        // Written by the loader at the end of its own boot-time pass, overwritten in full
        // every pass: a file present here failed to load at the *last* boot, not necessarily
        // still today, which is exactly why no separate "resolved" flag is needed, a clean
        // reload next boot just drops it.
        $loadErrors = get_option($this->directory()::LOAD_ERRORS_OPTION, []);
        $loadErrors = is_array($loadErrors) ? $loadErrors : [];

        $maxBytes = $this->directory()->maxFileBytes();
        $files    = [];
        foreach ($this->directory()->listSlugs() as $slug) {
            $size = $this->directory()->fileSize($slug);
            if ($size !== null && $size > $maxBytes) {
                // Same file the loader skips: don't read it back either, and surface why.
                $files[] = ['filename' => $slug, 'error' => "file is {$size} bytes, over the {$maxBytes} byte limit"];
                continue;
            }

            $content = $this->directory()->read($slug);
            if ($content === null) {
                continue;
            }

            $file = ['filename' => $slug, 'content' => FileWriter::stripGuard($content)];
            if (isset($loadErrors[$slug]) && is_string($loadErrors[$slug])) {
                $file['error'] = $loadErrors[$slug];
            }

            $files[] = $this->annotateEntry($file, $content);
        }

        return new WP_REST_Response($files, 200);
    }

    // Hook for a subclass to add resource-specific fields to a list entry or a push response,
    // derived from the file's own source (never by executing it). Base adds nothing; see
    // ApiFilesController, which flags a route whose permission is open (F1).
    /**
     * @param array<string, mixed> $entry
     * @return array<string, mixed>
     */
    protected function annotateEntry(array $entry, string $rawContent): array // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter -- $rawContent is the seam subclasses read
    {
        return $entry;
    }

    public function push_file(WP_REST_Request $request): WP_REST_Response
    {
        $filename = (string) $request->get_param('filename');
        $content  = (string) $request->get_param('content');

        // register_routes()'s validate_callback already rejects the request before WP ever
        // calls this method, but that enforcement is invisible to static analysis: nothing in
        // this function's own body ties $filename back to the pattern, and $filename reaches a
        // filesystem path a few lines down (directory->filePath()/write()). A direct check
        // on the raw value here, not just the indirect validate_callback registration, is what
        // actually clears that path-injection finding.
        if (!static::isValidFilename($filename)) {
            return new WP_REST_Response(['error' => 'Invalid filename'], 400);
        }

        // Before anything reads $content into a tokeniser (ClassScanner) or `php -l`: an
        // oversized blob would otherwise exhaust memory, an uncatchable E_ERROR that 500s
        // the request instead of failing it cleanly (LP-SEC-02 / F19 / F20).
        $maxBytes = $this->directory()->maxFileBytes();
        if (strlen($content) > $maxBytes) {
            return new WP_REST_Response([
                'error' => sprintf(
                    'File is %d bytes, over the %d byte limit. Split it, or raise the loopress_max_file_bytes filter.',
                    strlen($content),
                    $maxBytes,
                ),
            ], 413);
        }

        try {
            $guarded = FileWriter::withGuard($content);
        } catch (\InvalidArgumentException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 400);
        }

        $syntax = $this->checkSyntax($guarded);
        if ($syntax['status'] === 'error') {
            return new WP_REST_Response(['error' => "File has invalid PHP syntax: {$syntax['message']}"], 400);
        }

        // Same tokenizer the loader itself uses at boot (ClassScanner::declaredClasses()),
        // run here instead so a wrong number of classes fails the push immediately with a
        // clear message, rather than surfacing later as a silent failure only visible in the
        // PHP error log. Unlike checkSyntax() above, this needs no `exec`/`php` binary, so it
        // still runs even on hosts where the syntax check itself is unavailable.
        $classes = ClassScanner::declaredClasses($content);
        if (count($classes) !== 1) {
            $found = $classes === [] ? 'none' : implode(', ', $classes);
            return new WP_REST_Response(['error' => "File must declare exactly one class, found {$found}"], 400);
        }

        $className = $classes[0];
        $collision = $this->findCollision($filename, $className);
        if ($collision !== null) {
            return new WP_REST_Response(['error' => $collision], 400);
        }

        try {
            $this->directory()->write($filename, $guarded);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        $response = $this->annotateEntry(['filename' => $filename], $content);
        if ($syntax['status'] === 'unavailable') {
            // Distinguishes "verified, no error" from "couldn't verify here" for the CLI:
            // the write still succeeded, this is a heads-up, not a failure.
            $response['syntax_check'] = 'skipped';
        }

        return new WP_REST_Response($response, 200);
    }

    // Removes one deployed file. This is the only way to take a route or hook off the server
    // through the product: the files live under wp-content/, outside the plugin directory, so
    // deactivating the plugin does not remove them, and before this endpoint a file pushed by
    // a leaked token could only be cleared over SSH/SFTP (F3).
    public function delete_file(WP_REST_Request $request): WP_REST_Response
    {
        $filename = (string) $request->get_param('filename');

        // Defense in depth, same as push_file(): re-check the raw value here, not only via the
        // register_routes() validate_callback, so the path that reaches the filesystem a line
        // down is tied to the pattern in this method's own body.
        if (!static::isValidFilename($filename)) {
            return new WP_REST_Response(['error' => 'Invalid filename'], 400);
        }

        if (!$this->directory()->delete($filename)) {
            return new WP_REST_Response(['error' => 'File not found'], 404);
        }

        // Drop any stale boot-time load error for this slug so list_files() stops reporting a
        // file that no longer exists. The loader rewrites this option in full on its next pass
        // regardless; this just keeps `lps <resource> list` consistent right after a delete.
        $loadErrors = get_option($this->directory()::LOAD_ERRORS_OPTION, []);
        if (is_array($loadErrors) && array_key_exists($filename, $loadErrors)) {
            unset($loadErrors[$filename]);
            update_option($this->directory()::LOAD_ERRORS_OPTION, $loadErrors, false);
        }

        return new WP_REST_Response(['filename' => $filename, 'deleted' => true], 200);
    }

    // Catches at push time what the loader would otherwise only discover, silently, at the
    // next boot. Two sources checked, in order:
    // 1. Another file in the same directory already declaring the same class: found by the
    //    same static tokenizer scan, never by require()ing anything.
    // 2. WP core or another active plugin, both already loaded in this very request (push_file
    //    is itself a WP REST request, dispatched after the loader already ran): class_exists()
    //    is safe to use directly here, unlike at the loader's own class_exists() check which
    //    only rules out *other* files.
    private function findCollision(string $filename, string $className): ?string
    {
        // PHP resolves class names case-insensitively (class_exists(), `new $x()`, and the
        // "Cannot redeclare class" fatal itself all ignore case), so comparing scanned names
        // with a strict, case-sensitive in_array() would miss a real collision that only
        // differs by case, and would also miss the inverse: wrongly flagging a file that only
        // recased its own class (e.g. `Hello` -> `HELLO`) as a collision with WP core/another
        // plugin, since its lowercased form no longer strictly matches $previousClasses below.
        $normalizedClassName = strtolower($className);
        $maxBytes            = $this->directory()->maxFileBytes();

        foreach ($this->directory()->listSlugs() as $slug) {
            if ($slug === $filename) {
                continue; // re-pushing the same file is an update, never a collision with itself
            }

            $size = $this->directory()->fileSize($slug);
            if ($size !== null && $size > $maxBytes) {
                // The loader skips this file, so it declares nothing at runtime: don't
                // tokenise it here just to check for a collision that can't happen.
                continue;
            }

            $existingContent = $this->directory()->read($slug);
            if ($existingContent === null) {
                continue;
            }

            $existingClasses = array_map('strtolower', ClassScanner::declaredClasses($existingContent));
            if (in_array($normalizedClassName, $existingClasses, true)) {
                return "Class {$className} is already declared by {$this->label()}/{$slug}.php";
            }
        }

        // The loader already ran for this same request and required every existing file,
        // including $filename's own previous content if it existed: class_exists() would
        // therefore already be true for a class name this exact file declared before this
        // push, which isn't a collision, just an unchanged (or renamed-away-from) class.
        $previousContent = $this->directory()->read($filename);
        $previousClasses = $previousContent !== null
            ? array_map('strtolower', ClassScanner::declaredClasses($previousContent))
            : [];
        if (!in_array($normalizedClassName, $previousClasses, true) && class_exists($className, false)) {
            return "Class {$className} is already declared by WordPress core or another plugin";
        }

        return null;
    }

    // A file that fails to write was never going to work anyway, but one that writes fine and
    // only fails later, inside the loader's own try/catch, gives the user zero signal: `push`
    // reports success and `list` shows the file as present. Catching real syntax errors here,
    // at push time, is what lets the CLI actually tell the user something's wrong instead of
    // only the PHP error log.
    //
    // Deliberately shells out to the bare `php` on PATH rather than PHP_BINARY/PHP_BINDIR:
    // under php-fpm (how WordPress actually runs almost everywhere), PHP_BINARY is the fpm
    // master binary, not a CLI-capable one, and its directory layout isn't reliably a sibling
    // of the real `php` CLI binary either (confirmed against a real Local by Flywheel install,
    // where fpm lives in .../sbin/ and the CLI binary in a sibling .../bin/), and calling it
    // with `-l` doesn't lint, it just prints php-fpm's own usage text and a non-zero exit code
    // that looks like a syntax error but isn't one. `exec()` (and thus a `php` binary at all)
    // is routinely unavailable on managed hosts, so this degrades to "can't verify" rather
    // than blocking a push that might be perfectly valid. Same reasoning either way: never
    // trust a syntax error message before confirming it actually looks like one.
    /** @return array{status: 'ok'|'error'|'unavailable', message: ?string} */
    private function checkSyntax(string $code): array
    {
        if (!function_exists('exec') || self::execDisabled()) {
            return ['status' => 'unavailable', 'message' => null];
        }

        $tmpFile = tempnam(sys_get_temp_dir(), 'loopress-' . $this->label() . '-');
        if ($tmpFile === false) {
            return ['status' => 'unavailable', 'message' => null];
        }

        // A failed write leaves $tmpFile at 0 bytes, and `php -l` on an empty file reports
        // "No syntax errors detected", a false "ok" for content that was never actually
        // linted: exactly the false-positive this whole method exists to avoid.
        if (file_put_contents($tmpFile, $code) === false) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
            unlink($tmpFile); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
            return ['status' => 'unavailable', 'message' => null];
        }

        $output   = [];
        $exitCode = 0;
        exec('php -l ' . escapeshellarg($tmpFile) . ' 2>&1', $output, $exitCode); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec

        unlink($tmpFile); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink

        $joined = implode("\n", $output);

        if ($exitCode === 0 && str_contains($joined, 'No syntax errors detected')) {
            return ['status' => 'ok', 'message' => null];
        }

        // Genuine `php -l` failures always say "Parse error" or "Fatal error"; anything else
        // (missing binary, a php-fpm/php-cgi binary that doesn't understand `-l` the same way,
        // an unexpected output shape) means the check itself is unreliable here, not that the
        // file is broken, don't turn an inconclusive check into a false rejection.
        if (!str_contains($joined, 'Parse error') && !str_contains($joined, 'Fatal error')) {
            return ['status' => 'unavailable', 'message' => null];
        }

        // First line is always "PHP Parse error: ..." or "PHP Fatal error: ...", the rest is
        // an "Errors parsing ..." footer that repeats the filename back, not useful to the user.
        return ['status' => 'error', 'message' => $output[0] ?? 'Unknown syntax error.'];
    }

    // disable_functions is a comma-separated list of exact function names: a substring check
    // for 'exec' would also match 'shell_exec' being disabled while exec() itself is still
    // callable, wrongly reporting the check as unavailable.
    private static function execDisabled(): bool
    {
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        return in_array('exec', $disabled, true);
    }
}
