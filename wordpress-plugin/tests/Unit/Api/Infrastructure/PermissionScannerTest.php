<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\Infrastructure;

use Loopress\Api\Infrastructure\PermissionScanner;
use PHPUnit\Framework\TestCase;

class PermissionScannerTest extends TestCase
{
    private const HEAD = "<?php\ndeclare(strict_types=1);\nuse Loopress\\Api\\Attribute\\Permission;\n";

    public function test_detects_a_class_level_public_permission_attribute(): void
    {
        $code = self::HEAD . "#[Permission(public: true)]\nfinal class R { public function get(): array { return []; } }\n";
        $this->assertTrue(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_detects_a_method_level_public_permission_attribute(): void
    {
        $code = self::HEAD . "final class R {\n    #[Permission(public: true)]\n    public function get(): array { return []; }\n}\n";
        $this->assertTrue(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_detects_a_bare_true_first_positional_argument(): void
    {
        $code = self::HEAD . "#[Permission(true)]\nfinal class R { public function get(): array { return []; } }\n";
        $this->assertTrue(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_detects_a_fully_qualified_attribute_name(): void
    {
        $code = "<?php\ndeclare(strict_types=1);\n#[\\Loopress\\Api\\Attribute\\Permission(public: true)]\nfinal class R { public function get(): array { return []; } }\n";
        $this->assertTrue(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_detects_permission_alongside_other_attributes_in_one_group(): void
    {
        $code = self::HEAD . "#[\\Attribute, Permission(public: true)]\nfinal class R { public function get(): array { return []; } }\n";
        $this->assertTrue(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_ignores_a_non_public_permission_attribute(): void
    {
        $code = self::HEAD . "#[Permission(capability: 'edit_posts')]\nfinal class R { public function get(): array { return []; } }\n";
        $this->assertFalse(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_ignores_an_explicit_public_false(): void
    {
        $code = self::HEAD . "#[Permission(public: false)]\nfinal class R { public function get(): array { return []; } }\n";
        $this->assertFalse(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_ignores_a_file_with_no_permission_attribute(): void
    {
        $code = self::HEAD . "final class R { public function get(): array { return []; } }\n";
        $this->assertFalse(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_ignores_the_word_public_true_in_a_comment_or_string(): void
    {
        $code = self::HEAD . "final class R {\n    // #[Permission(public: true)] would make this open\n    public function get(): array { return ['note' => 'public: true']; }\n}\n";
        $this->assertFalse(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_does_not_match_an_aliased_import_documented_blind_spot(): void
    {
        $code = "<?php\ndeclare(strict_types=1);\nuse Loopress\\Api\\Attribute\\Permission as Perm;\n#[Perm(public: true)]\nfinal class R { public function get(): array { return []; } }\n";
        $this->assertFalse(PermissionScanner::declaresOpenRoute($code));
    }

    public function test_survives_malformed_php(): void
    {
        $this->assertFalse(PermissionScanner::declaresOpenRoute('<?php this is not valid { { {'));
    }
}
