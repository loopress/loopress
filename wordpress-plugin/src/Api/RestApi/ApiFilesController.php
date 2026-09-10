<?php

declare(strict_types=1);

namespace Loopress\Api\RestApi;

use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Api\Infrastructure\PermissionScanner;
use Loopress\Infrastructure\AbstractFilesController;
use Loopress\Infrastructure\AbstractFilesDirectory;

/**
 * Management endpoint used by `lps api push`/`pull`/`list`, distinct from the custom routes a
 * pushed file itself exposes (see RouteLoader, registered under loopress-api/v1 instead of
 * loopress/v1 to avoid a namespace collision). See AbstractFilesController for the behaviour.
 */
class ApiFilesController extends AbstractFilesController
{
    public function __construct(private ApiDirectory $directory) {}

    protected function directory(): AbstractFilesDirectory
    {
        return $this->directory;
    }

    /** @return non-falsy-string */
    protected function routePath(): string
    {
        return '/api-files';
    }

    // A slash-separated path of segments, each either lowercase kebab-case or a bracketed
    // dynamic segment name (e.g. 'invoice-pdf/[order_id]'). The bracket alternative's first
    // char is restricted the same way as RouteLoader::DYNAMIC_SEGMENT_PATTERN: a leading digit
    // would push cleanly but produce a route that silently never matches any request (see that
    // constant's own comment).
    /** @return non-empty-string */
    protected static function filenamePattern(): string
    {
        return '/^(?:[a-z0-9-]+|\[[A-Za-z_]\w*\])(?:\/(?:[a-z0-9-]+|\[[A-Za-z_]\w*\]))*$/';
    }

    // Flags a route whose permission is open: `#[Permission(public: true)]` on the class or a
    // verb method means the route runs for anyone on the internet, with no authentication
    // (F1). Detected lexically from the source, see PermissionScanner for the blind spots.
    // Hooks have no permission concept, so HookFilesController does not override this.
    /**
     * @param array<string, mixed> $entry
     * @return array<string, mixed>
     */
    protected function annotateEntry(array $entry, string $rawContent): array
    {
        $entry['public'] = PermissionScanner::declaresOpenRoute($rawContent);
        return $entry;
    }
}
