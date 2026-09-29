<?php

declare(strict_types=1);

namespace Loopress\Apps\Service;

use Loopress\Apps\Infrastructure\AppsDirectory;
use Nyholm\Psr7\Request;
use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Client\ClientInterface;

/**
 * Reports webserver-level protections that Loopress cannot enforce from PHP for the publicly
 * served apps/ directory. AppsDirectory writes an .htaccess sending X-Content-Type-Options:
 * nosniff, but .htaccess only works where the webserver reads it (Apache/LiteSpeed with
 * AllowOverride); nginx ignores it outright. Mirrors ComposerService's vendor-exposure check:
 * verify from the outside, over a real HTTP request, instead of trusting the file on disk, and
 * cache the result so it is not a network round-trip on every diagnostics load.
 */
class AppsDiagnostics
{
    private const NOSNIFF_CACHE_KEY = 'loopress_apps_assets_missing_nosniff';

    public function __construct(
        private ClientInterface $httpClient,
        private AppsDirectory $directory,
    ) {}

    /** @return array{issues: list<array{code: string, message: string}>} */
    public function getDiagnostics(): array
    {
        $issues = [];

        if ($this->isMissingNosniff()) {
            $issues[] = [
                'code'    => 'apps_assets_missing_nosniff',
                'message' => 'App assets are served without the X-Content-Type-Options: nosniff header. ' .
                    'Configure this webserver to send it for wp-content/loopress/apps/ (an Apache "Header set" ' .
                    'directive, or an nginx "add_header" directive), so an uploaded asset cannot be sniffed ' .
                    'into an executable content type.',
            ];
        }

        return ['issues' => $issues];
    }

    // True only when a deployed asset is actually served and its response is missing the
    // nosniff header. No deployed asset (nothing to probe) or a network failure returns false:
    // never report an issue we could not actually observe.
    private function isMissingNosniff(): bool
    {
        $cached = get_transient(self::NOSNIFF_CACHE_KEY);
        if (is_array($cached) && array_key_exists('missing', $cached)) {
            return $cached['missing'];
        }

        $probeUrl = $this->probeUrl();
        if ($probeUrl === null) {
            return false;
        }

        $missing = false;
        try {
            $response = $this->httpClient->sendRequest(new Request('GET', $probeUrl));
            if ($response->getStatusCode() === 200) {
                $missing = strtolower(trim($response->getHeaderLine('X-Content-Type-Options'))) !== 'nosniff';
            }
        } catch (ClientExceptionInterface) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
            // Network failure: don't report a false positive, just retry at the next cache expiry.
        }

        set_transient(self::NOSNIFF_CACHE_KEY, ['missing' => $missing], DAY_IN_SECONDS);

        return $missing;
    }

    // The public URL of any one deployed asset, or null when no app has assets to probe.
    private function probeUrl(): ?string
    {
        foreach ($this->directory->listAppNames() as $name) {
            $relPath = $this->directory->firstAssetPath($name);
            if ($relPath !== null) {
                return content_url('loopress/apps/' . $name . '/' . ltrim($relPath, '/'));
            }
        }

        return null;
    }
}
