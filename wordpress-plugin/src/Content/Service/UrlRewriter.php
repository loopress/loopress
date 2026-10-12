<?php

declare(strict_types=1);

namespace Loopress\Content\Service;

// phpcs:disable WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize, WordPress.PHP.DiscouragedPHPFunctions.serialize_unserialize -- rewriting serialized meta needs both, unserialize() runs with allowed_classes false.

// Rewrites the source site's URL to this site's URL in imported content, except under the
// source uploads URL: media are never downloaded, they stay served by the source site (see
// RemoteUploads). Serialized values are unserialized, rewritten and reserialized, a plain
// string replace would change their lengths and corrupt them.
// ponytail: JSON-escaped URLs (`https:\/\/...`, Elementor data) are not rewritten, add a second
// pattern if a builder plugin needs it.
final readonly class UrlRewriter
{
    private string $from;
    private string $to;
    /** @var non-empty-string */
    private string $pattern;

    public function __construct(string $from, string $to, string $keepUnder)
    {
        $this->from = rtrim($from, '/');
        $this->to   = rtrim($to, '/');
        $kept       = str_starts_with($keepUnder, $this->from) ? substr($keepUnder, strlen($this->from)) : '';
        $lookahead  = $kept === '' ? '' : '(?!' . preg_quote($kept, '#') . ')';
        $this->pattern = '#' . preg_quote($this->from, '#') . $lookahead . '#';
    }

    public function rewrite(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if ($this->from === '' || $this->from === $this->to || !str_contains($value, $this->from)) {
            return $value;
        }

        if (!is_serialized($value)) {
            return (string) preg_replace($this->pattern, $this->to, $value);
        }

        $data = unserialize($value, ['allowed_classes' => false]);
        if (is_string($data)) {
            return serialize($this->rewrite($data));
        }

        // Objects come back as __PHP_Incomplete_Class and are left as they are.
        if (!is_array($data)) {
            return $value;
        }

        array_walk_recursive($data, function (mixed &$item): void {
            if (is_string($item)) {
                $item = $this->rewrite($item);
            }
        });

        return serialize($data);
    }
}
