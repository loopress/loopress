<?php

declare(strict_types=1);

namespace Loopress\Hooks\RestApi;

use Loopress\Hooks\Infrastructure\HooksDirectory;
use Loopress\Infrastructure\AbstractFilesController;
use Loopress\Infrastructure\AbstractFilesDirectory;

/**
 * Management endpoint used by `lps hook push`/`pull`/`list`. Behaviour lives in
 * AbstractFilesController; registered under its own loopress/v1/hook-files route rather than
 * reusing api-files because a hooks/ file is pushed/pulled independently of api/, even though
 * both end up as one require()d PHP file with a class.
 */
class HookFilesController extends AbstractFilesController
{
    public function __construct(private HooksDirectory $directory) {}

    protected function directory(): AbstractFilesDirectory
    {
        return $this->directory;
    }

    /** @return non-falsy-string */
    protected function routePath(): string
    {
        return '/hook-files';
    }

    // Slash-separated lowercase kebab-case segments. No bracketed dynamic-segment alternative
    // like ApiFilesController's own pattern: a hook slug is never a URL path, so there's
    // nothing for a segment like '[order_id]' to mean here.
    /** @return non-empty-string */
    protected static function filenamePattern(): string
    {
        return '/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/';
    }

    // A slug whose last segment is literally "index" would otherwise pass the pattern, write
    // successfully, and then vanish from every read: HooksDirectory::listSlugs() deliberately
    // excludes any file named index.php (the anti-listing guard it writes itself), matching on
    // the filename alone regardless of directory. Without this, push_file() would return 200
    // for a hook that then silently never loads and never appears in `lps hook list`/`pull`.
    public static function isValidFilename(mixed $value): bool
    {
        return parent::isValidFilename($value) && is_string($value) && !self::lastSegmentIsIndex($value);
    }

    private static function lastSegmentIsIndex(string $filename): bool
    {
        $segments = explode('/', $filename);
        return end($segments) === 'index';
    }
}
