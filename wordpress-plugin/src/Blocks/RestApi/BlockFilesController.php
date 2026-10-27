<?php

declare(strict_types=1);

namespace Loopress\Blocks\RestApi;

use Loopress\Blocks\Infrastructure\BlocksDirectory;
use Loopress\Infrastructure\Narrow;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Management endpoint behind `lps block list`/`pull`/`push`/`rm`. One request carries one
 * whole block (every file of its folder), written atomically by BlocksDirectory::write().
 */
final readonly class BlockFilesController
{
    use RequiresManageOptionsCapability;

    public function __construct(private BlocksDirectory $directory) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/block-files', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_blocks'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'push_block'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'slug'  => ['required' => true, 'type' => 'string'],
                    'files' => ['required' => true, 'type' => 'object'],
                ],
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_block'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => ['slug' => ['required' => true, 'type' => 'string']],
            ],
        ]);
    }

    public function list_blocks(): WP_REST_Response
    {
        $loadErrors    = Narrow::map(get_option(BlocksDirectory::LOAD_ERRORS_OPTION, []));
        $runtimeErrors = Narrow::map(get_option(BlocksDirectory::RUNTIME_ERRORS_OPTION, []));

        $blocks = [];
        foreach ($this->directory->listSlugs() as $slug) {
            $block = ['slug' => $slug, 'files' => $this->directory->read($slug)];
            if (is_string($loadErrors[$slug] ?? null)) {
                $block['error'] = $loadErrors[$slug];
            }

            // Only while render.php is still the version that threw it.
            $runtime = Narrow::map($runtimeErrors[$slug] ?? null);
            if (isset($runtime['revision']) && $runtime['revision'] === $this->directory->renderRevision($slug)) {
                $block['runtimeError'] = [
                    'message' => Narrow::string($runtime['message'] ?? ''),
                    'at'      => gmdate('c', Narrow::int($runtime['at'] ?? 0)),
                ];
            }

            $blocks[] = $block;
        }

        return new WP_REST_Response($blocks, 200);
    }

    public function push_block(WP_REST_Request $request): WP_REST_Response
    {
        $slug = $request->get_param('slug');
        // A direct check on the raw value: it reaches a filesystem path below.
        if (!BlocksDirectory::isValidSlug($slug)) {
            return new WP_REST_Response(['error' => 'Invalid block slug: lowercase letters, digits and hyphens, starting with a letter.'], 400);
        }
        $slug = Narrow::string($slug);

        $files = self::problems($slug, $request->get_param('files'));
        if (is_string($files)) {
            return new WP_REST_Response(['error' => "{$slug}: {$files}"], 400);
        }

        try {
            $this->directory->write($slug, $files);
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response(['slug' => $slug, 'files' => array_keys($files)], 200);
    }

    public function delete_block(WP_REST_Request $request): WP_REST_Response
    {
        $slug = $request->get_param('slug');
        if (!BlocksDirectory::isValidSlug($slug)) {
            return new WP_REST_Response(['error' => 'Invalid block slug'], 400);
        }
        $slug = Narrow::string($slug);

        if (!$this->directory->delete($slug)) {
            return new WP_REST_Response(['error' => "Unknown block \"{$slug}\""], 404);
        }

        return new WP_REST_Response(['slug' => $slug, 'deleted' => true], 200);
    }

    /**
     * The validated files, or what's wrong with them. The CLI checks the same before sending;
     * this is the check that holds for any other client.
     *
     * @return array<string, string>|string
     */
    public static function problems(string $slug, mixed $raw): array|string
    {
        if (!is_array($raw)) {
            return '"files" must be an object of file name => content.';
        }

        $files = [];
        foreach ($raw as $name => $content) {
            if (!in_array($name, BlocksDirectory::FILES, true)) {
                return "unsupported file \"{$name}\", a block folder holds only " . implode(', ', BlocksDirectory::FILES) . '.';
            }
            if (!is_string($content)) {
                return "{$name} must be a string.";
            }
            if (strlen($content) > BlocksDirectory::maxFileBytes()) {
                return "{$name} is over the " . BlocksDirectory::maxFileBytes() . ' byte limit.';
            }
            $files[$name] = $content;
        }

        $problem = self::blockProblem($slug, $files['block.json'] ?? null, $files['render.php'] ?? null);

        return $problem ?? $files;
    }

    private static function blockProblem(string $slug, ?string $blockJson, ?string $render): ?string
    {
        if ($blockJson === null || $render === null) {
            return ($blockJson === null ? 'block.json' : 'render.php') . ' is required.';
        }

        $metadata = json_decode($blockJson, true);
        if (!is_array($metadata) || array_is_list($metadata)) {
            return 'block.json is not a valid JSON object.';
        }
        if (($metadata['name'] ?? null) !== "loopress/{$slug}") {
            return "block.json \"name\" must be \"loopress/{$slug}\".";
        }

        // PHP's own parser, in-process. Unlike hooks/, no `php -l` pass on top.
        // ponytail: token_get_all only, add AbstractFilesController's `php -l` fallback if a compile error slips through.
        try {
            token_get_all($render, TOKEN_PARSE);
        } catch (\ParseError $e) {
            return 'render.php: PHP Parse error: ' . $e->getMessage() . ' on line ' . $e->getLine();
        }

        return null;
    }
}
