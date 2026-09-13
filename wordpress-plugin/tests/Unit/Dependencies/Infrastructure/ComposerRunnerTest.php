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

    // Regression: composer/installers not present at getLoopressDir() (not installed yet, or a
    // broken environment) must be a silent miss, never a fatal, since this registers before
    // every single Composer command runs, most of which never touch a wpackagist package.
    public function test_installers_autoloader_is_a_noop_when_the_directory_is_missing(): void
    {
        $dir = '/tmp/loopress-runner-test-' . uniqid() . '/';
        $this->environment = $this->createMock(LoopressEnvironment::class);
        $this->environment->method('getLoopressDir')->willReturn($dir);
        $this->runner = new ComposerRunner($this->environment);

        $this->invokeRegisterInstallersAutoloader();

        $this->assertFalse(class_exists('Composer\\Installers\\DoesNotExist' . uniqid(), true));
    }

    // Regression: this is the actual bug. Composer\Installers\* must resolve from our own
    // known-good copy even when the file only appears on disk *after* the autoloader is
    // registered (composer/installers being installed by this very run), and even when
    // another, broken autoloader for the same class is already registered first.
    public function test_installers_autoloader_resolves_a_class_that_appears_after_registration(): void
    {
        $loopressDir = sys_get_temp_dir() . '/loopress-runner-test-' . uniqid();
        $dir = $loopressDir . '/vendor/composer/installers/src/Composer/Installers/';
        $this->environment = $this->createMock(LoopressEnvironment::class);
        $this->environment->method('getLoopressDir')->willReturn($loopressDir);
        $this->runner = new ComposerRunner($this->environment);

        $brokenAutoloaderRan = false;
        spl_autoload_register(function (string $className) use (&$brokenAutoloaderRan): void {
            if ($className === 'Composer\\Installers\\FixtureInstaller') {
                $brokenAutoloaderRan = true;
                include_once '/nonexistent/stale-classmap-path.php';
            }
        });

        $this->invokeRegisterInstallersAutoloader();

        mkdir($dir, 0777, true);
        file_put_contents(
            $dir . 'FixtureInstaller.php',
            "<?php\nnamespace Composer\\Installers;\nclass FixtureInstaller {}\n"
        );

        $this->assertTrue(class_exists('Composer\\Installers\\FixtureInstaller'));
        $this->assertFalse($brokenAutoloaderRan, 'the prepended autoloader must answer before the broken one runs');
    }

    private function invokeRegisterInstallersAutoloader(): void
    {
        $ref = new \ReflectionMethod(ComposerRunner::class, 'registerInstallersAutoloader');
        $ref->setAccessible(true);
        $ref->invoke($this->runner);

        // Each test registers its own closure over a fresh temp dir; the production guard
        // against double-registration would otherwise make every test after the first a noop.
        $flag = new \ReflectionProperty(ComposerRunner::class, 'installersAutoloaderRegistered');
        $flag->setAccessible(true);
        $flag->setValue(null, false);
    }
}
