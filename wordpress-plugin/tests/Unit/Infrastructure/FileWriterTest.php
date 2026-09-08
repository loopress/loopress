<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Loopress\Infrastructure\FileWriter;
use PHPUnit\Framework\TestCase;

class FileWriterTest extends TestCase
{
    // ── withGuard ────────────────────────────────────────────────────────────

    public function test_withGuard_inserts_the_guard_right_after_declare(): void
    {
        $code = "<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello\n{\n}\n";

        $result = FileWriter::withGuard($code);

        $this->assertStringContainsString(
            "declare(strict_types=1);\nif (!defined('ABSPATH')) {\n    exit;\n}\n\n\nfinal class Hello",
            $result,
        );
    }

    public function test_withGuard_tolerates_whitespace_variations_around_declare(): void
    {
        $code = "<?php\ndeclare ( strict_types = 1 ) ;\nfinal class Hello {}\n";

        $result = FileWriter::withGuard($code);

        $this->assertStringContainsString('ABSPATH', $result);
    }

    public function test_withGuard_rejects_a_file_without_declare_strict_types(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        FileWriter::withGuard("<?php\nfinal class Hello {}\n");
    }

    public function test_withGuard_rejects_a_file_with_declare_appearing_twice(): void
    {
        $code = "<?php\ndeclare(strict_types=1);\n// declare(strict_types=1); again in a comment\nfinal class Hello {}\n";

        $this->expectException(\InvalidArgumentException::class);

        FileWriter::withGuard($code);
    }

    // Regression: a semicolon-form namespace declaration must stay the very first statement
    // after declare(), or PHP fatals ("namespace declaration statement has to be the very
    // first statement in the script"). Inserting the guard between the two, as a naive
    // "right after declare()" rule would, produced exactly that.
    public function test_withGuard_inserts_the_guard_after_a_semicolon_form_namespace_declaration(): void
    {
        $code = "<?php\n\ndeclare(strict_types=1);\n\nnamespace Acme\\Hooks;\n\nfinal class Hello\n{\n}\n";

        $result = FileWriter::withGuard($code);

        $this->assertStringContainsString(
            "namespace Acme\\Hooks;\nif (!defined('ABSPATH')) {\n    exit;\n}\n",
            $result,
        );
        $this->assertStringNotContainsString("declare(strict_types=1);\nif (!defined('ABSPATH'))", $result);
    }

    public function test_withGuard_tolerates_a_comment_between_declare_and_namespace(): void
    {
        $code = "<?php\ndeclare(strict_types=1);\n// a comment\nnamespace Acme\\Hooks;\nfinal class Hello {}\n";

        $result = FileWriter::withGuard($code);

        $this->assertStringContainsString("namespace Acme\\Hooks;\nif (!defined('ABSPATH'))", $result);
    }

    // ── stripGuard ───────────────────────────────────────────────────────────

    public function test_stripGuard_is_the_exact_inverse_of_withGuard(): void
    {
        $original = "<?php\n\ndeclare(strict_types=1);\n\nfinal class Hello\n{\n    public function get(): array\n    {\n        return ['hello' => 'world'];\n    }\n}\n";

        $roundTripped = FileWriter::stripGuard(FileWriter::withGuard($original));

        $this->assertSame($original, $roundTripped);
    }

    public function test_stripGuard_is_a_no_op_on_content_without_a_guard(): void
    {
        $code = "<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n";

        $this->assertSame($code, FileWriter::stripGuard($code));
    }
}
