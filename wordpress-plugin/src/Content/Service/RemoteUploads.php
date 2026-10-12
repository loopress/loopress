<?php

declare(strict_types=1);

namespace Loopress\Content\Service;

// After `lps content pull`, media files are not downloaded: an attachment whose file is missing
// here is served from the source site's uploads URL instead. Files that do exist locally (an
// image uploaded on this site since) keep their local URL.
final class RemoteUploads
{
    public function attachmentUrl(string $url): string
    {
        return $this->remote($url);
    }

    /**
     * @param array<array-key, mixed> $sources
     * @return array<array-key, mixed>
     */
    public function srcset(array $sources): array
    {
        foreach ($sources as $width => $source) {
            if (is_array($source) && isset($source['url']) && is_string($source['url'])) {
                $sources[$width]['url'] = $this->remote($source['url']);
            }
        }

        return $sources;
    }

    private function remote(string $url): string
    {
        $source = get_option(ContentService::SOURCE_OPTION);
        if (!is_array($source) || !is_string($source['uploadsUrl'] ?? null) || $source['uploadsUrl'] === '') {
            return $url;
        }

        $uploads = wp_get_upload_dir();
        if (!str_starts_with($url, $uploads['baseurl'] . '/')) {
            return $url;
        }

        $relative = substr($url, strlen($uploads['baseurl']));

        return file_exists($uploads['basedir'] . $relative) ? $url : rtrim($source['uploadsUrl'], '/') . $relative;
    }
}
