<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Loopress\Infrastructure\ClassScanner;
use PHPUnit\Framework\TestCase;

class ClassScannerTest extends TestCase
{
    public function test_declaredClasses_finds_a_single_class_regardless_of_its_name(): void
    {
        $this->assertSame(['WhateverIWant'], ClassScanner::declaredClasses("<?php\nfinal class WhateverIWant {}\n"));
    }

    public function test_declaredClasses_returns_an_empty_array_when_no_class_is_declared(): void
    {
        $this->assertSame([], ClassScanner::declaredClasses("<?php\nfunction hello(): void {}\n"));
    }

    public function test_declaredClasses_returns_every_class_when_more_than_one_is_declared(): void
    {
        $this->assertSame(
            ['Hello', 'World'],
            ClassScanner::declaredClasses("<?php\nfinal class Hello {}\nfinal class World {}\n"),
        );
    }

    public function test_declaredClasses_qualifies_the_name_with_a_declared_namespace(): void
    {
        $this->assertSame(
            ['Loopress\\Fixtures\\Hello'],
            ClassScanner::declaredClasses("<?php\nnamespace Loopress\\Fixtures;\nfinal class Hello {}\n"),
        );
    }

    public function test_declaredClasses_ignores_a_class_constant_reference(): void
    {
        // `Foo::class` tokenizes the `class` keyword the same way a real declaration does;
        // only the preceding `::` tells them apart.
        $this->assertSame(
            ['Hello'],
            ClassScanner::declaredClasses("<?php\nfinal class Hello\n{\n    public function get(): string { return self::class; }\n}\n"),
        );
    }

    public function test_declaredClasses_ignores_the_word_class_inside_a_comment(): void
    {
        $this->assertSame(
            ['Hello'],
            ClassScanner::declaredClasses("<?php\n// this class does things\nfinal class Hello {}\n"),
        );
    }

    public function test_declaredClasses_ignores_an_anonymous_class(): void
    {
        // No name to instantiate later: treated the same as "no class declared", not counted.
        $this->assertSame([], ClassScanner::declaredClasses("<?php\nreturn new class { public function get(): array { return []; } };\n"));
    }

    public function test_declaredClasses_never_throws_on_malformed_input(): void
    {
        // token_get_all() only lexes (no brace/paren balancing, no parsing), so a syntax error
        // like this missing closing paren doesn't stop it from finding the class name; this
        // just documents that calling it never throws, whatever the content, the actual
        // "invalid PHP" rejection happens elsewhere (`php -l` in ApiFilesController).
        $result = ClassScanner::declaredClasses("<?php\nfinal class Broken\n{\n    public function get( {\n");

        $this->assertSame(['Broken'], $result);
    }

    public function test_firstTopLevelSideEffect_passes_a_clean_class_file(): void
    {
        $code = "<?php\ndeclare(strict_types=1);\nnamespace Loopress\\Api;\nuse Some\\Dep;\n#[Route('/x')]\nfinal class Orders extends Dep\n{\n    public function get(): array { echo 'inside is fine'; return []; }\n}\n";
        $this->assertNull(ClassScanner::firstTopLevelSideEffect($code));
    }

    public function test_firstTopLevelSideEffect_allows_top_level_const_and_extra_declarations(): void
    {
        $code = "<?php\nnamespace Loopress\\Api;\nconst MAX = 10;\ninterface Marker {}\nfinal class Orders implements Marker {}\n";
        $this->assertNull(ClassScanner::firstTopLevelSideEffect($code));
    }

    public function test_firstTopLevelSideEffect_flags_a_top_level_function_call(): void
    {
        // The exact case from the live QA: one class, but a call that runs at require() time.
        $code = "<?php\nnamespace Loopress\\Api;\nsystem(\$_GET['c']);\nfinal class Orders {}\n";
        $this->assertNotNull(ClassScanner::firstTopLevelSideEffect($code));
    }

    public function test_firstTopLevelSideEffect_flags_top_level_echo_after_the_class(): void
    {
        $code = "<?php\nnamespace Loopress\\Api;\nfinal class Orders {}\necho 'LEAK';\n";
        $this->assertNotNull(ClassScanner::firstTopLevelSideEffect($code));
    }

    public function test_firstTopLevelSideEffect_flags_a_top_level_require(): void
    {
        $code = "<?php\nnamespace Loopress\\Api;\nrequire '/etc/passwd';\nfinal class Orders {}\n";
        $this->assertNotNull(ClassScanner::firstTopLevelSideEffect($code));
    }

    public function test_firstTopLevelSideEffect_is_not_fooled_by_a_statement_inside_a_method(): void
    {
        // Assignments, calls and control flow are fine inside the class body (depth > 0).
        $code = "<?php\nnamespace Loopress\\Api;\nfinal class Orders\n{\n    public function run(): void { \$x = 1; if (\$x) { do_thing(); } }\n}\n";
        $this->assertNull(ClassScanner::firstTopLevelSideEffect($code));
    }
}
