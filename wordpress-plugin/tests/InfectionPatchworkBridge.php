<?php

declare(strict_types=1);

namespace Loopress\Tests;

// The stream-wrapper methods below are deliberately left untyped: PHP and Patchwork call
// them with loosely typed arguments (Patchwork passes a bare `true` where PHP passes the
// STREAM_* bitmask), the same way every other userland stream wrapper is written.

/**
 * Makes Infection's mutant substitution survive brain/monkey.
 *
 * Infection swaps the file under test for a mutated copy with a `file://` stream wrapper
 * (Infection\StreamWrapper\IncludeInterceptor). brain/monkey pulls in Patchwork, which
 * registers its own `file://` wrapper on top and, for every file it rewrites, re-reads the
 * source through the previously registered wrapper by calling
 * `IncludeInterceptor::stream_open($path, 'r', true)`. Infection decides whether to serve
 * the mutant with `(bool) ($options & STREAM_OPEN_FOR_INCLUDE)`; Patchwork passes a bare
 * `true` there, `true & 0x80 === 0`, so Infection serves the original and the mutant is
 * never seen. Every mutant whose only covering test uses brain/monkey then "escapes"
 * regardless of how strong that test is.
 *
 * This wrapper replaces IncludeInterceptor with an equivalent one that also serves the
 * replacement on a plain read of the intercepted path, not only on PHP's own include. It
 * is installed from tests/bootstrap.php and is a no-op when Infection is not running.
 */
final class InfectionPatchworkBridge
{
    /** @var resource|null */
    public $context;

    /** @var resource|false */
    private $fp = false;

    /** @var resource|false */
    private $dir = false;

    private static string $intercept = '';

    private static string $replacement = '';

    public static function install(): void
    {
        $interceptor = \Infection\StreamWrapper\IncludeInterceptor::class;
        if (!class_exists($interceptor, false)) {
            return;
        }

        try {
            $reflection = new \ReflectionClass($interceptor);
            $intercept  = $reflection->getProperty('intercept');
            $replace    = $reflection->getProperty('replacement');

            $interceptValue   = $intercept->isInitialized() ? $intercept->getValue() : null;
            $replacementValue = $replace->isInitialized() ? $replace->getValue() : null;
        } catch (\ReflectionException) {
            return;
        }

        if (!is_string($interceptValue) || $interceptValue === '' || !is_string($replacementValue) || $replacementValue === '') {
            return;
        }

        self::$intercept   = $interceptValue;
        self::$replacement = $replacementValue;

        self::enable();
    }

    private static function enable(): void
    {
        stream_wrapper_unregister('file');
        stream_wrapper_register('file', self::class);
    }

    private function disable(): void
    {
        stream_wrapper_restore('file');
    }

    /**
     * @param string $path
     * @param string $mode
     * @param int $options
     * @param string|null $openedPath
     */
    public function stream_open($path, $mode, $options, &$openedPath = null): bool
    {
        $this->disable();

        try {
            if ($this->pointsAtIntercepted($path)) {
                $this->fp = fopen(self::$replacement, 'rb');

                return $this->fp !== false;
            }

            $usePath = (bool) ((int) $options & STREAM_USE_PATH);
            $this->fp = $this->context === null
                ? fopen($path, $mode, $usePath)
                : fopen($path, $mode, $usePath, $this->context);
        } finally {
            self::enable();
        }

        return $this->fp !== false;
    }

    /**
     * @param string $path
     */
    private function pointsAtIntercepted($path): bool
    {
        if ($path === self::$intercept) {
            return true;
        }

        $resolved = @realpath((string) $path);

        return $resolved !== false && $resolved === self::$intercept;
    }

    /**
     * @param int<1, max> $count
     */
    public function stream_read($count): string
    {
        return is_resource($this->fp) ? (string) fread($this->fp, (int) $count) : '';
    }

    /**
     * @param string $data
     */
    public function stream_write($data): int
    {
        return is_resource($this->fp) ? (int) fwrite($this->fp, (string) $data) : 0;
    }

    public function stream_eof(): bool
    {
        return !is_resource($this->fp) || feof($this->fp);
    }

    /**
     * @param int $offset
     * @param int $whence
     */
    public function stream_seek($offset, $whence = SEEK_SET): bool
    {
        return is_resource($this->fp) && fseek($this->fp, (int) $offset, (int) $whence) === 0;
    }

    public function stream_tell(): int
    {
        return is_resource($this->fp) ? (int) ftell($this->fp) : 0;
    }

    public function stream_flush(): bool
    {
        return is_resource($this->fp) && fflush($this->fp);
    }

    /**
     * @param int<0, max> $newSize
     */
    public function stream_truncate($newSize): bool
    {
        return is_resource($this->fp) && ftruncate($this->fp, (int) $newSize);
    }

    /**
     * @param int<0, 7> $operation
     */
    public function stream_lock($operation): bool
    {
        $operation = (int) $operation;

        return $operation === 0 || !is_resource($this->fp) || flock($this->fp, $operation);
    }

    /**
     * @return array<int|string, int>|false
     */
    public function stream_stat(): array|false
    {
        return is_resource($this->fp) ? fstat($this->fp) : false;
    }

    /**
     * @param int $option
     * @param int $arg1
     * @param int $arg2
     */
    public function stream_set_option($option, $arg1, $arg2): bool
    {
        return false;
    }

    /**
     * @param int $castAs
     * @return resource|false
     */
    public function stream_cast($castAs)
    {
        return $this->fp;
    }

    public function stream_close(): void
    {
        if (is_resource($this->fp)) {
            fclose($this->fp);
        }
    }

    /**
     * @param string $path
     * @param int $flags
     * @return array<int|string, int>|false
     */
    public function url_stat($path, $flags): array|false
    {
        $this->disable();

        $flags = (int) $flags;
        $quiet = (bool) ($flags & STREAM_URL_STAT_QUIET);

        try {
            if ($quiet) {
                set_error_handler(static fn(): bool => true);
            }

            try {
                $result = ($flags & STREAM_URL_STAT_LINK) !== 0 ? @lstat($path) : @stat($path);
            } finally {
                if ($quiet) {
                    restore_error_handler();
                }
            }
        } finally {
            self::enable();
        }

        return $result;
    }

    /**
     * @param string $path
     * @param int $mode
     * @param int $options
     */
    public function mkdir($path, $mode, $options): bool
    {
        $this->disable();

        try {
            $recursive = (bool) ((int) $options & STREAM_MKDIR_RECURSIVE);

            return $this->context === null
                ? mkdir($path, (int) $mode, $recursive)
                : mkdir($path, (int) $mode, $recursive, $this->context);
        } finally {
            self::enable();
        }
    }

    /**
     * @param string $path
     * @param int $options
     */
    public function rmdir($path, $options): bool
    {
        $this->disable();

        try {
            return $this->context === null ? rmdir($path) : rmdir($path, $this->context);
        } finally {
            self::enable();
        }
    }

    /**
     * @param string $pathFrom
     * @param string $pathTo
     */
    public function rename($pathFrom, $pathTo): bool
    {
        $this->disable();

        try {
            return $this->context === null
                ? rename($pathFrom, $pathTo)
                : rename($pathFrom, $pathTo, $this->context);
        } finally {
            self::enable();
        }
    }

    /**
     * @param string $path
     */
    public function unlink($path): bool
    {
        $this->disable();

        try {
            return $this->context === null ? unlink($path) : unlink($path, $this->context);
        } finally {
            self::enable();
        }
    }

    /**
     * @param string $path
     * @param int $option
     * @param mixed $value
     * @return bool
     */
    public function stream_metadata($path, $option, $value)
    {
        $this->disable();

        try {
            return match ((int) $option) {
                // PHP passes ints (a name for *_NAME), the is_int()/is_string() checks only narrow
                // the documented `mixed`.
                STREAM_META_TOUCH => $value === [] ? touch($path) : touch($path, ...array_filter(array_values((array) $value), 'is_int')),
                STREAM_META_OWNER, STREAM_META_OWNER_NAME => (is_int($value) || is_string($value)) && chown($path, $value),
                STREAM_META_GROUP, STREAM_META_GROUP_NAME => (is_int($value) || is_string($value)) && chgrp($path, $value),
                STREAM_META_ACCESS => is_int($value) && chmod($path, $value),
                default => false,
            };
        } finally {
            self::enable();
        }
    }

    /**
     * @param string $path
     * @param int $options
     */
    public function dir_opendir($path, $options): bool
    {
        $this->disable();

        try {
            $this->dir = $this->context === null ? opendir($path) : opendir($path, $this->context);
        } finally {
            self::enable();
        }

        return $this->dir !== false;
    }

    public function dir_readdir(): string|false
    {
        return is_resource($this->dir) ? readdir($this->dir) : false;
    }

    public function dir_rewinddir(): bool
    {
        if (is_resource($this->dir)) {
            rewinddir($this->dir);
        }

        return true;
    }

    public function dir_closedir(): bool
    {
        if (is_resource($this->dir)) {
            closedir($this->dir);
        }

        return true;
    }
}
