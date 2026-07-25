<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\Infrastructure;

use Loopress\Api\Infrastructure\FileWriter;
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

        $this->assertStringContainsString("ABSPATH", $result);
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
