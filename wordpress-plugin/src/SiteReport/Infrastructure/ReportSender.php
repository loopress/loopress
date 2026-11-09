<?php

declare(strict_types=1);

namespace Loopress\SiteReport\Infrastructure;

use Loopress\Infrastructure\Narrow;
use Loopress\SiteReport\Service\ReportPayload;

/**
 * Sends the report to the Loopress api. Blocking (5 s) only when an admin saves the token in
 * the Settings tab, to show the result; fire-and-forget from the cron, like UsagePing, so a
 * slow or down api never delays a request.
 */
final readonly class ReportSender
{
    public const CONNECTED   = 'connected';
    public const INVALID     = 'invalid';
    public const WRONG_SITE  = 'wrong_site';
    public const UNREACHABLE = 'unreachable';

    private const DEFAULT_API_URL = 'https://api.loopress.dev';
    private const MAX_BODY_BYTES  = 256 * 1024;

    public function __construct(private ReportPayload $payload = new ReportPayload())
    {
    }

    /** @return array{result: string, expected?: string} */
    public function sendNow(string $token): array
    {
        $response = $this->post($token, true);
        if ($response === null || is_wp_error($response)) {
            return ['result' => self::UNREACHABLE];
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        if ($code >= 200 && $code < 300) {
            return ['result' => self::CONNECTED];
        }
        if ($code === 401) {
            return ['result' => self::INVALID];
        }
        if ($code === 409) {
            $body = Narrow::map(json_decode(wp_remote_retrieve_body($response), true));

            return ['result' => self::WRONG_SITE, 'expected' => Narrow::string($body['expected'] ?? '')];
        }

        return ['result' => self::UNREACHABLE];
    }

    public function sendInBackground(string $token): void
    {
        $this->post($token, false);
    }

    public static function endpoint(): string
    {
        $base = defined('LOOPRESS_API_URL') ? constant('LOOPRESS_API_URL') : self::DEFAULT_API_URL;

        return rtrim(is_string($base) && $base !== '' ? $base : self::DEFAULT_API_URL, '/') . '/site-reports';
    }

    /** @return array<array-key, mixed>|\WP_Error|null null when the body is over the api's cap */
    private function post(string $token, bool $blocking): array|\WP_Error|null
    {
        $body = (string) wp_json_encode($this->payload->build());
        if (strlen($body) > self::MAX_BODY_BYTES) {
            return null;
        }

        return wp_remote_post(self::endpoint(), [
            'blocking'   => $blocking,
            'timeout'    => $blocking ? 5 : 1,
            // WordPress's default User-Agent carries home_url(), already in the body anyway.
            'user-agent' => 'Loopress/' . LOOPRESS_VERSION,
            'headers'    => [
                'Authorization' => 'Bearer ' . $token,
                'Content-Type'  => 'application/json',
            ],
            'body'       => $body,
        ]);
    }
}
