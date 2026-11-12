<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Dependencies\Infrastructure;

use Loopress\Dependencies\Exception\ConcurrentOperationException;
use Loopress\Dependencies\Infrastructure\ComposerRunner;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;

// Runs the real Composer application, against an empty project folder: only commands that need
// neither network nor packages.
class ComposerRunnerRunTest extends TestCase
{
    private string $dir;
    private LoopressEnvironment&MockObject $environment;
    private ComposerRunner $runner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . '/loopress-composer-run-' . uniqid() . '/';
        mkdir($this->dir, 0777, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
        file_put_contents($this->dir . 'composer.json', '{"name":"loopress/test","require":{}}'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

        $this->environment = $this->createMock(LoopressEnvironment::class);
        $this->environment->method('getLoopressDir')->willReturn($this->dir);
        $this->runner = new ComposerRunner($this->environment);
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove($this->dir);
        (new \ReflectionProperty(ComposerRunner::class, 'installersAutoloaderRegistered'))->setValue(null, false);
        parent::tearDown();
    }

    public function test_run_executes_the_composer_command_in_the_loopress_folder_and_returns_its_output(): void
    {
        $this->environment->expects($this->once())->method('ensureInitialized');

        $result = $this->runner->run(['validate'], ['--no-check-publish' => true, '--no-check-lock' => true]);

        $this->assertSame(0, $result['exit_code']);
        $this->assertStringContainsString('is valid', (string) $result['output']);
    }

    public function test_a_failing_command_reports_its_exit_code(): void
    {
        file_put_contents($this->dir . 'composer.json', '{not json'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

        $result = $this->runner->run(['validate']);

        $this->assertNotSame(0, $result['exit_code']);
    }

    public function test_the_process_environment_is_restored_and_the_lock_released_afterwards(): void
    {
        $original = getenv('COMPOSER_HOME');
        putenv('COMPOSER_HOME=/before/composer'); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_putenv
        $home = getenv('HOME');

        $this->runner->run(['validate'], ['--no-check-publish' => true]);

        $this->assertSame('/before/composer', getenv('COMPOSER_HOME'));
        $this->assertSame($home, getenv('HOME'));
        putenv($original === false ? 'COMPOSER_HOME' : "COMPOSER_HOME={$original}"); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_putenv

        // A second operation can take the lock again.
        $this->assertSame(0, $this->runner->run(['validate'], ['--no-check-publish' => true])['exit_code']);
    }

    public function test_a_second_operation_while_one_runs_is_refused(): void
    {
        $held = fopen($this->dir . '.loopress.lock', 'c'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
        $this->assertNotFalse($held);
        flock($held, LOCK_EX);

        try {
            $this->runner->run(['validate']);
            $this->fail('Expected ConcurrentOperationException');
        } catch (ConcurrentOperationException $e) {
            $this->assertStringContainsString('Another Composer operation', $e->getMessage());
        } finally {
            fclose($held); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
        }
    }
}
