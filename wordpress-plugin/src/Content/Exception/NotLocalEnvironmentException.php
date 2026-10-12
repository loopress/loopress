<?php

declare(strict_types=1);

namespace Loopress\Content\Exception;

// Thrown when a content import (which deletes this site's posts and terms) reaches a site whose
// wp_get_environment_type() is not "local". The check lives here, on the site that would lose
// its content, so no client can wipe a production site by pointing at the wrong URL.
class NotLocalEnvironmentException extends \RuntimeException {}
