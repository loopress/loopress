<?php

declare(strict_types=1);

namespace Loopress\Dependencies\Exception;

/**
 * A sync intent references a WordPress.org plugin or theme whose folder already exists under
 * wp-content/ but isn't tracked in composer.lock: it was installed by hand. Composer can't
 * cleanly install over it; the caller must re-run with force to let Loopress remove and
 * reinstall it.
 */
class UnmanagedPackageException extends \RuntimeException
{
    /** @param list<array{slug: string, type: string, path: string, installedVersion: string}> $collisions */
    public function __construct(public readonly array $collisions)
    {
        parent::__construct('One or more plugins or themes are installed outside Loopress.');
    }
}
