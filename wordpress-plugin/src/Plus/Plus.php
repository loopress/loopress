<?php

namespace Loopress\Plus;

use Loopress\Contract\Module;
use Loopress\Plus\Infrastructure\LoopressEnvironment;
use Loopress\Plus\Module\ComposerModule;

/**
 * Entry point of the Plus feature set. Everything under src/Plus/ ships only in the
 * Plus edition (see scripts/build-flavor.cjs); the plugin entry file calls this inside
 * its build markers, so the free artifact never references this namespace.
 */
class Plus
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
