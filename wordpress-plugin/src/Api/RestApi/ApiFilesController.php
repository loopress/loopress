<?php

declare(strict_types=1);

namespace Loopress\Api\RestApi;

use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Api\Infrastructure\ClassScanner;
use Loopress\Api\Infrastructure\FileWriter;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Management endpoint used by `lps api push`/`pull`/`list`, distinct from the custom routes
 * a pushed file itself exposes (see RouteLoader, registered under loopress-api/v1 instead of
 * loopress/v1 to avoid a namespace collision).
 */
class ApiFilesController
{
    use RequiresManageOptionsCapability;

    // Matches FileWriter/RouteLoader's filename convention: a slash-separated path of
    // segments, each either lowercase kebab-case or a bracketed dynamic segment name (e.g.
    // 'invoice-pdf/[order_id]'), no path traversal (no '.' anywhere), extension is never
    // taken from the client. The bracket alternative's first char is restricted the same way
    // as RouteLoader::DYNAMIC_SEGMENT_PATTERN: a leading digit would push cleanly but produce
    // a route that silently never matches any request (see that constant's own comment).
    private const FILENAME_PATTERN = '/^(?:[a-z0-9-]+|\[[A-Za-z_]\w*\])(?:\/(?:[a-z0-9-]+|\[[A-Za-z_]\w*\]))*$/';

    public function __construct(private ApiDirectory $directory) {}

    public function register_routes(): void
    {
        // filename is a body arg, not a URL path param: a nested slug can contain '/' and
        // '[]', and embedding those in a URL path segment would depend on the target server
        // correctly handling percent-encoded slashes (Apache rejects %2F by default unless
        // AllowEncodedSlashes is set; nginx has its own equivalent quirks), exactly the kind
        // of hosting-environment variance Loopress can't assume away. A body param sidesteps
        // it entirely, same as 'content' already does.
        register_rest_route('loopress/v1', '/api-files', [
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
                        'validate_callback' => self::isValidFilename(...),
                    ],
                    'content' => [
                        'required' => true,
                        'type'     => 'string',
                    ],
                ],
            ],
        ]);
    }

    // Public and static, like ApiNamespace::isValid(), so it's directly unit-testable rather
    // than only reachable through a real WP REST dispatch.
    public static function isValidFilename(mixed $value): bool
    {
        return is_string($value) && preg_match(self::FILENAME_PATTERN, $value) === 1;
    }

    public function list_files(): WP_REST_Response
    {
        // Written by RouteLoader at the end of its own boot-time pass (ApiDirectory::
        // LOAD_ERRORS_OPTION), overwritten in full every rest_api_init: a file present here
        // failed to load at the *last* boot, not necessarily still today, which is exactly
        // why no separate "resolved" flag is needed, a clean reload next boot just drops it.
        $loadErrors = get_option(ApiDirectory::LOAD_ERRORS_OPTION, []);
        $loadErrors = is_array($loadErrors) ? $loadErrors : [];

        $files = [];
        foreach ($this->directory->listSlugs() as $slug) {
            $content = $this->directory->read($slug);
            if ($content === null) {
                continue;
            }

            $file = ['filename' => $slug, 'content' => FileWriter::stripGuard($content)];
            if (isset($loadErrors[$slug]) && is_string($loadErrors[$slug])) {
                $file['error'] = $loadErrors[$slug];
            }

            $files[] = $file;
        }

        return new WP_REST_Response($files, 200);
    }

    public function push_file(WP_REST_Request $request): WP_REST_Response
    {
        $filename = (string) $request->get_param('filename');
        $content  = (string) $request->get_param('content');

        // register_routes()'s validate_callback already rejects the request before WP ever
        // calls this method, but that enforcement is invisible to static analysis: nothing in
        // this function's own body ties $filename back to FILENAME_PATTERN, and $filename
        // reaches a filesystem path a few lines down (ApiDirectory::filePath()/write()). A
        // direct regex check on the raw value here, not just the indirect validate_callback
        // registration, is what actually clears that path-injection finding.
        if (!self::isValidFilename($filename)) {
            return new WP_REST_Response(['error' => 'Invalid filename'], 400);
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

        // Same tokenizer RouteLoader itself uses at boot (ClassScanner::declaredClasses()),
        // run here instead so a wrong number of classes fails the push immediately with a
        // clear message, rather than surfacing later as a silent 404 only visible in the PHP
        // error log. Unlike checkSyntax() above, this needs no `exec`/`php` binary, so it
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
            $this->directory->write($filename, $guarded);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        $response = ['filename' => $filename];
        if ($syntax['status'] === 'unavailable') {
            // Distinguishes "verified, no error" from "couldn't verify here" for the CLI:
            // the write still succeeded, this is a heads-up, not a failure.
            $response['syntax_check'] = 'skipped';
        }

        return new WP_REST_Response($response, 200);
    }

    // Catches at push time what RouteLoader would otherwise only discover, silently, at the
    // next boot (see US-4 in the plugin's "Extensions proposées (2e vague)" doc). Two sources
    // checked, in order:
    // 1. Another api/ file already declaring the same class: found by the same static
    //    tokenizer scan, never by require()ing anything.
    // 2. WP core or another active plugin, both already loaded in this very request (push_file
    //    is itself a WP REST request, dispatched after rest_api_init already ran RouteLoader):
    //    class_exists() is safe to use directly here, unlike at RouteLoader::loadFile()'s own
    //    class_exists() check which only rules out *other* files.
    private function findCollision(string $filename, string $className): ?string
    {
        foreach ($this->directory->listSlugs() as $slug) {
            if ($slug === $filename) {
                continue; // re-pushing the same file is an update, never a collision with itself
            }

            $existingContent = $this->directory->read($slug);
            if ($existingContent !== null && in_array($className, ClassScanner::declaredClasses($existingContent), true)) {
                return "Class {$className} is already declared by api/{$slug}.php";
            }
        }

        // RouteLoader already ran for this same request and required every existing file,
        // including $filename's own previous content if it existed: class_exists() would
        // therefore already be true for a class name this exact file declared before this
        // push, which isn't a collision, just an unchanged (or renamed-away-from) class.
        $previousContent = $this->directory->read($filename);
        $previousClasses = $previousContent !== null ? ClassScanner::declaredClasses($previousContent) : [];
        if (!in_array($className, $previousClasses, true) && class_exists($className, false)) {
            return "Class {$className} is already declared by WordPress core or another plugin";
        }

        return null;
    }

    // A file that fails to write was never going to work anyway, but one that writes fine
    // and only fails later, inside RouteLoader's own rest_api_init try/catch, gives the user
    // zero signal: `api push` reports success and `api list` shows the file as present (it
    // only checks the file exists), while the route silently 404s. Catching real syntax
    // errors here, at push time, is what lets the CLI actually tell the user something's
    // wrong instead of only the PHP error log.
    //
    // Deliberately shells out to the bare `php` on PATH rather than PHP_BINARY/PHP_BINDIR:
    // under php-fpm (how WordPress actually runs almost everywhere), PHP_BINARY is the fpm
    // master binary, not a CLI-capable one, and its directory layout isn't reliably a sibling
    // of the real `php` CLI binary either (confirmed against a real Local by Flywheel install,
    // where fpm lives in .../sbin/ and the CLI binary in a sibling .../bin/) — calling it with
    // `-l` doesn't lint, it just prints php-fpm's own usage text and a non-zero exit code that
    // looks like a syntax error but isn't one. `exec()` (and thus a `php` binary at all) is
    // routinely unavailable on managed hosts, so this degrades to "can't verify" rather than
    // blocking a push that might be perfectly valid — same reasoning either way: never trust a
    // syntax error message before confirming it actually looks like one.
    /** @return array{status: 'ok'|'error'|'unavailable', message: ?string} */
    private function checkSyntax(string $code): array
    {
        if (!function_exists('exec') || self::execDisabled()) {
            return ['status' => 'unavailable', 'message' => null];
        }

        $tmpFile = tempnam(sys_get_temp_dir(), 'loopress-api-');
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
