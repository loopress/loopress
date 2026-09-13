<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\Infrastructure;

use Loopress\Hooks\Infrastructure\HookAttributeScanner;
use PHPUnit\Framework\TestCase;

class HookAttributeScannerTest extends TestCase
{
    private const HEAD = "<?php\ndeclare(strict_types=1);\nuse Loopress\\Hooks\\Attribute\\Action;\nuse Loopress\\Hooks\\Attribute\\Filter;\nuse Loopress\\Hooks\\Attribute\\Cron;\n";

    public function test_detects_an_action_with_a_positional_hook(): void
    {
        $code = self::HEAD . "final class R {\n    #[Action('init')]\n    public function run(): void {}\n}\n";
        $this->assertSame([['type' => 'action', 'hook' => 'init', 'recurrence' => null]], HookAttributeScanner::bindingsIn($code));
    }

    public function test_ignores_priority_and_acceptedArgs_and_still_reads_the_hook(): void
    {
        $code = self::HEAD . "final class R {\n    #[Action('init', priority: 20, acceptedArgs: 2)]\n    public function run(): void {}\n}\n";
        $this->assertSame([['type' => 'action', 'hook' => 'init', 'recurrence' => null]], HookAttributeScanner::bindingsIn($code));
    }

    public function test_detects_a_filter_with_a_positional_hook(): void
    {
        $code = self::HEAD . "final class R {\n    #[Filter('the_content', priority: 20)]\n    public function tweak(string \$c): string { return \$c; }\n}\n";
        $this->assertSame([['type' => 'filter', 'hook' => 'the_content', 'recurrence' => null]], HookAttributeScanner::bindingsIn($code));
    }

    public function test_detects_a_cron_with_only_a_recurrence(): void
    {
        $code = self::HEAD . "final class R {\n    #[Cron('hourly')]\n    public function run(): void {}\n}\n";
        $this->assertSame([['type' => 'cron', 'hook' => null, 'recurrence' => 'hourly']], HookAttributeScanner::bindingsIn($code));
    }

    public function test_detects_a_cron_with_an_explicit_hook(): void
    {
        $code = self::HEAD . "final class R {\n    #[Cron('daily', hook: 'my_custom_cron')]\n    public function run(): void {}\n}\n";
        $this->assertSame([['type' => 'cron', 'hook' => 'my_custom_cron', 'recurrence' => 'daily']], HookAttributeScanner::bindingsIn($code));
    }

    public function test_detects_multiple_bindings_across_methods(): void
    {
        $code = self::HEAD . "final class R {\n    #[Action('init')]\n    public function onInit(): void {}\n\n    #[Filter('the_content')]\n    public function tweak(string \$c): string { return \$c; }\n}\n";
        $this->assertSame(
            [
                ['type' => 'action', 'hook' => 'init', 'recurrence' => null],
                ['type' => 'filter', 'hook' => 'the_content', 'recurrence' => null],
            ],
            HookAttributeScanner::bindingsIn($code),
        );
    }

    public function test_ignores_a_file_with_no_hook_attribute(): void
    {
        $code = self::HEAD . "final class R { public function run(): void {} }\n";
        $this->assertSame([], HookAttributeScanner::bindingsIn($code));
    }

    public function test_ignores_the_attribute_name_in_a_comment_or_string(): void
    {
        $code = self::HEAD . "final class R {\n    // #[Action('init')] would bind this\n    public function run(): void {}\n}\n";
        $this->assertSame([], HookAttributeScanner::bindingsIn($code));
    }

    public function test_survives_malformed_php(): void
    {
        $this->assertSame([], HookAttributeScanner::bindingsIn('<?php this is not valid { { {'));
    }
}
