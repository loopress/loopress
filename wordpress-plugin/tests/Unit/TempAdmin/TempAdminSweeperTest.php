<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\TempAdmin;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\TempAdmin\Infrastructure\TempAdminSweeper;
use Loopress\TempAdmin\Module\TempAdminModule;
use PHPUnit\Framework\TestCase;

class TempAdminSweeperTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $old = gmdate('Y-m-d H:i:s', time() - 3600);
        $new = gmdate('Y-m-d H:i:s', time() - 60);

        Functions\when('get_users')->justReturn([
            self::user(7, 'lps-temp-old', 'lps-temp-old@lps-temp.invalid', $old),
            // Still in use by a running `lps project config`: inside the grace period.
            self::user(8, 'lps-temp-new', 'lps-temp-new@lps-temp.invalid', $new),
            // Same prefix, real mailbox: a human account, not ours.
            self::user(9, 'lps-temp-jane', 'jane@acme.com', $old),
            // WordPress's search is a LIKE, the prefix must be at the start.
            self::user(10, 'x-lps-temp-', 'x@lps-temp.invalid', $old),
        ]);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_find_keeps_only_accounts_matching_prefix_and_invalid_email(): void
    {
        $logins = array_map(static fn(object $user): string => $user->user_login, (new TempAdminSweeper())->find());

        $this->assertSame(['lps-temp-old', 'lps-temp-new'], $logins);
    }

    public function test_sweep_deletes_only_accounts_past_the_grace_period(): void
    {
        Functions\expect('wp_delete_user')->once()->with(7)->andReturn(true);

        (new TempAdminSweeper())->sweep();
        $this->addToAssertionCount(1);
    }

    public function test_notice_names_leftovers_for_users_who_can_delete_them(): void
    {
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('__')->returnArg();

        ob_start();
        (new TempAdminModule(new TempAdminSweeper()))->renderNotice();
        $html = (string) ob_get_clean();

        $this->assertStringContainsString('lps-temp-old, lps-temp-new.', $html);
        $this->assertStringNotContainsString('jane', $html);
    }

    public function test_notice_is_hidden_from_users_who_cannot_delete_users(): void
    {
        Functions\when('current_user_can')->justReturn(false);

        ob_start();
        (new TempAdminModule(new TempAdminSweeper()))->renderNotice();

        $this->assertSame('', ob_get_clean());
    }

    private static function user(int $id, string $login, string $email, string $registered): object
    {
        return (object) ['ID' => (string) $id, 'user_login' => $login, 'user_email' => $email, 'user_registered' => $registered];
    }
}
