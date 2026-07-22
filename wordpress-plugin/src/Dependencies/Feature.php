<?php

declare(strict_types=1);

namespace Loopress\Dependencies;

use Loopress\Contract\Module;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Dependencies\Module\ComposerModule;

/**
 * Entry point of the Composer dependency management feature. Everything under
 * src/Dependencies/ ships only in the Loopress Full edition (see scripts/build-flavor.cjs);
 * the plugin entry file calls this inside its build markers, so the Loopress Light
 * artifact never references this namespace.
 */
class Feature
{
    /** @return Module[] */
    public static function bootstrap(): array
    {
        $env = new LoopressEnvironment();

        $autoloadError = null;
        $autoload      = $env->getAutoloadPath();
        if ($autoload) {
            // A broken vendor/ can surface as any Throwable (\Error for missing files,
            // E_USER_ERROR from Composer's platform check, ...): catch everything so the
            // admin UI can offer the auto-repair flow instead of white-screening the site.
            try {
                ob_start();
                require_once $autoload;
                ob_end_clean();
            } catch (\Throwable $e) {
                ob_end_clean();
                $autoloadError = $e->getMessage();
            }
        }

        return [new ComposerModule($env, $autoloadError)];
    }
}
