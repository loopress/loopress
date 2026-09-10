<?php

declare(strict_types=1);

namespace Loopress\Seo\Exception;

// Thrown when a pushed redirect is rejected: `urlTo` points off this site without an explicit
// `"allowExternal": true`, or `status` is not one of the accepted values. Without this, a
// leaked token could turn any path on the site (`/`, `/wp-login.php`, `/checkout`) into a
// sticky 301 to an attacker's page (F13). Maps to HTTP 422.
class InvalidRedirectException extends \RuntimeException {}
