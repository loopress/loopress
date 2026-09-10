<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Dependencies\Infrastructure;

use Loopress\Dependencies\Infrastructure\ComposerRunner;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ComposerRunnerTest extends TestCase
{
    private LoopressEnvironment&MockObject $environment;
    private ComposerRunner $runner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->environment = $this->createMock(LoopressEnvironment::class);
        $this->environment->method('getLoopressDir')->willReturn('/var/www/wp-content/loopress/');
        $this->runner = new ComposerRunner($this->environment);
    }

    /**
     * @param string[] $args
     * @param array<string, mixed> $extraOptions
     * @return array<string, mixed>
     */
    private function buildInputDef(array $args, array $extraOptions = []): array
    {
        $ref = new \ReflectionMethod(ComposerRunner::class, 'buildInputDef');
        $ref->setAccessible(true);
        /** @var array<string, mixed> $def */
        $def = $ref->invoke($this->runner, $args, $extraOptions);
        return $def;
    }

    public function test_every_command_is_run_with_no_scripts(): void
    {
        foreach ([['update'], ['install'], ['dump-autoload'], ['require', 'guzzlehttp/guzzle:^7.0'], ['remove', 'a/b']] as $args) {
            $def = $this->buildInputDef($args);
            $this->assertTrue($def['--no-scripts'], "'{$args[0]}' must pass --no-scripts");
        }
    }

    public function test_builds_the_expected_input_definition_for_update(): void
    {
        $def = $this->buildInputDef(['update']);

        $this->assertSame('update', $def['command']);
        $this->assertArrayNotHasKey('packages', $def);
        $this->assertSame('/var/www/wp-content/loopress/', $def['--working-dir']);
        $this->assertTrue($def['--no-interaction']);
        $this->assertTrue($def['--no-ansi']);
        $this->assertTrue($def['--no-scripts']);
    }

    public function test_passes_package_arguments_through_for_require(): void
    {
        $def = $this->buildInputDef(['require', 'guzzlehttp/guzzle:^7.0']);

        $this->assertSame('require', $def['command']);
        $this->assertSame(['guzzlehttp/guzzle:^7.0'], $def['packages']);
        $this->assertTrue($def['--no-scripts']);
    }

    public function test_merges_extra_options_without_dropping_no_scripts(): void
    {
        $def = $this->buildInputDef(['outdated'], ['--direct' => true, '--format' => 'json']);

        $this->assertTrue($def['--direct']);
        $this->assertSame('json', $def['--format']);
        $this->assertTrue($def['--no-scripts']);
    }
}
