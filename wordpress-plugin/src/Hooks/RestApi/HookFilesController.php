<?php

declare(strict_types=1);

namespace Loopress\Hooks\RestApi;

use Loopress\Hooks\Infrastructure\HooksDirectory;
use Loopress\Infrastructure\ClassScanner;
use Loopress\Infrastructure\FileWriter;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Management endpoint used by `lps hook push`/`pull`/`list`. Structurally identical to
 * Api\RestApi\ApiFilesController (same validation: declare(strict_types=1) exactly once,
 * `php -l` syntax check, exactly one class, no name collision), registered under its own
 * loopress/v1/hook-files route rather than reusing api-files: a hooks/ file is pushed/pulled
 * independently of api/, even though both end up as one require()d PHP file with a class.
 */
class HookFilesController
{
    use RequiresManageOptionsCapability;

    // Slash-separated path of lowercase kebab-case segments, no path traversal (no '.'
    // anywhere), extension never taken from the client. No bracketed dynamic-segment
    // alternative like ApiFilesController's own pattern: a hook slug is never a URL path, so
    // there's nothing for a segment like '[order_id]' to mean here.
    private const FILENAME_PATTERN = '/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/';

    public function __construct(private HooksDirectory $directory) {}

    // A slug whose last segment is literally "index" would otherwise pass FILENAME_PATTERN,
    // write successfully, and then vanish from every read: HooksDirectory::listSlugs()
    // deliberately excludes any file named index.php (the anti-listing guard it writes
    // itself), matching on the filename alone regardless of directory. Without this, push_file()
    // would return 200 for a hook that then silently never loads and never appears in
    // `lps hook list`/`pull`.
    private static function lastSegmentIsIndex(string $filename): bool
    {
        $segments = explode('/', $filename);
        return end($segments) === 'index';
    }

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/hook-files', [
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

    public static function isValidFilename(mixed $value): bool
    {
        return is_string($value) && preg_match(self::FILENAME_PATTERN, $value) === 1 && !self::lastSegmentIsIndex($value);
    }

    public function list_files(): WP_REST_Response
    {
        $loadErrors = get_option(HooksDirectory::LOAD_ERRORS_OPTION, []);
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

        // Same defense-in-depth reasoning as ApiFilesController::push_file(): the
        // validate_callback above already rejects a bad filename before this runs, but a
        // direct check here is what a path-injection static analysis pass actually credits.
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
            $response['syntax_check'] = 'skipped';
        }

        return new WP_REST_Response($response, 200);
    }

    // Same reasoning and two-source check as ApiFilesController::findCollision(): another
    // hooks/ file already declaring the class, or WP core/another plugin already having it
    // loaded this same request.
    private function findCollision(string $filename, string $className): ?string
    {
        $normalizedClassName = strtolower($className);

        foreach ($this->directory->listSlugs() as $slug) {
            if ($slug === $filename) {
                continue;
            }

            $existingContent = $this->directory->read($slug);
            if ($existingContent === null) {
                continue;
            }

            $existingClasses = array_map('strtolower', ClassScanner::declaredClasses($existingContent));
            if (in_array($normalizedClassName, $existingClasses, true)) {
                return "Class {$className} is already declared by hooks/{$slug}.php";
            }
        }

        $previousContent = $this->directory->read($filename);
        $previousClasses = $previousContent !== null
            ? array_map('strtolower', ClassScanner::declaredClasses($previousContent))
            : [];
        if (!in_array($normalizedClassName, $previousClasses, true) && class_exists($className, false)) {
            return "Class {$className} is already declared by WordPress core or another plugin";
        }

        return null;
    }

    // Same shell-out-to-`php`-on-PATH reasoning as ApiFilesController::checkSyntax(): PHP_BINARY
    // is the fpm master binary under php-fpm, not CLI-capable, and `exec` is routinely
    // unavailable on managed hosts, so this degrades to "can't verify" rather than blocking a
    // push that might be perfectly valid.
    /** @return array{status: 'ok'|'error'|'unavailable', message: ?string} */
    private function checkSyntax(string $code): array
    {
        if (!function_exists('exec') || self::execDisabled()) {
            return ['status' => 'unavailable', 'message' => null];
        }

        $tmpFile = tempnam(sys_get_temp_dir(), 'loopress-hooks-');
        if ($tmpFile === false) {
            return ['status' => 'unavailable', 'message' => null];
        }

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

        if (!str_contains($joined, 'Parse error') && !str_contains($joined, 'Fatal error')) {
            return ['status' => 'unavailable', 'message' => null];
        }

        return ['status' => 'error', 'message' => $output[0] ?? 'Unknown syntax error.'];
    }

    private static function execDisabled(): bool
    {
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        return in_array('exec', $disabled, true);
    }
}
