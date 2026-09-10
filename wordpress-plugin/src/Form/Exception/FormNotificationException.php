<?php

declare(strict_types=1);

namespace Loopress\Form\Exception;

// Thrown when a pushed form's notification settings are rejected: an invalid recipient
// address, or a spoofed `sender_address` on a domain that is not the site's own. Overwriting
// notifications is opt-in (`"allowNotifications": true` in the request body) precisely because
// a leaked token could otherwise repoint every submission to an attacker's inbox and turn the
// site into an authenticated spam relay (F12). Maps to HTTP 422.
class FormNotificationException extends \RuntimeException {}
