<?php

declare(strict_types=1);

namespace Loopress\SiteReport\RestApi;

use Loopress\Infrastructure\Narrow;
use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\SiteReport\Infrastructure\ReportSender;
use Loopress\SiteReport\Module\SiteReportModule;
use Loopress\SiteReport\SiteToken;
use WP_REST_Request;
use WP_REST_Response;

/**
 * The "Console" setting: GET the connection state (token masked, never in clear), PUT a token
 * (sends one report right away and keeps the token unless the api rejected it), DELETE to
 * disconnect.
 */
final readonly class SiteTokenController
{
    use RequiresManageOptionsCapability;

    public function __construct(private ReportSender $sender = new ReportSender())
    {
    }

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/site-report', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_state'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'connect'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'token' => [
                        'required' => true,
                        'type'     => 'string',
                    ],
                ],
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'disconnect'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);
    }

    public function get_state(): WP_REST_Response
    {
        return new WP_REST_Response($this->state(), 200);
    }

    public function connect(WP_REST_Request $request): WP_REST_Response
    {
        $token = trim(Narrow::string($request->get_param('token')));
        if (!SiteToken::isValidFormat($token)) {
            return new WP_REST_Response(['error' => 'This is not a site token: copy it again from the console, it starts with lps_site_.'], 400);
        }

        $sent = $this->sender->sendNow($token);

        if ($sent['result'] === ReportSender::INVALID) {
            return new WP_REST_Response(['error' => 'Invalid token: it was revoked or regenerated in the console.', 'result' => $sent['result']], 400);
        }
        if ($sent['result'] === ReportSender::WRONG_SITE) {
            $expected = $sent['expected'] ?? '';

            return new WP_REST_Response([
                'error'    => 'This token belongs to ' . ($expected !== '' ? $expected : 'another site') . ', not to this site.',
                'result'   => $sent['result'],
                'expected' => $expected,
            ], 409);
        }

        // Connected, or the api could not be reached: kept either way, the cron retries.
        SiteToken::save($token);
        if (!SiteReportModule::schedule()) {
            SiteToken::clear();

            return new WP_REST_Response(['error' => 'The token is valid, but WordPress could not schedule the twice-daily report. Check that WP-cron is writable, then connect again.'], 500);
        }

        return new WP_REST_Response(['result' => $sent['result']] + $this->state(), 200);
    }

    public function disconnect(): WP_REST_Response
    {
        SiteToken::clear();
        SiteReportModule::unschedule();

        return new WP_REST_Response($this->state(), 200);
    }

    /** @return array{connected: bool, token: ?string, connectedUrl: ?string, url: string} */
    private function state(): array
    {
        $token = SiteToken::get();
        $url   = Narrow::string(get_option(SiteToken::URL_OPTION, ''));

        return [
            'connected'    => $token !== '',
            'token'        => SiteToken::masked($token),
            // Differs from `url` on a site cloned from another one's database: the copied token
            // reports for the original environment, and the api answers 409.
            'connectedUrl' => $token !== '' && $url !== '' ? $url : null,
            'url'          => home_url(),
        ];
    }
}
