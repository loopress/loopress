<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\Infrastructure;

use Loopress\Api\Infrastructure\ClassScanner;
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
}
