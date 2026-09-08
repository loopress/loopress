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

    /** @var string */
    private static $intercept = '';

    /** @var string */
    private static $replacement = '';

    public static function install(): void
    {
        $interceptor = 'Infection\\StreamWrapper\\IncludeInterceptor';
        if (!class_exists($interceptor, false)) {
            return;
        }

        try {
            $reflection = new \ReflectionClass($interceptor);
            $intercept  = $reflection->getProperty('intercept');
            $replace    = $reflection->getProperty('replacement');
            $intercept->setAccessible(true);
            $replace->setAccessible(true);

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

    private static function disable(): void
    {
        stream_wrapper_restore('file');
    }

    public function stream_open($path, $mode, $options, &$openedPath = null)
    {
        self::disable();

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

    private function pointsAtIntercepted($path)
    {
        if ($path === self::$intercept) {
            return true;
        }

        $resolved = @realpath((string) $path);

        return $resolved !== false && $resolved === self::$intercept;
    }

    public function stream_read($count)
    {
        return is_resource($this->fp) ? (string) fread($this->fp, (int) $count) : '';
    }

    public function stream_write($data)
    {
        return is_resource($this->fp) ? (int) fwrite($this->fp, (string) $data) : 0;
    }

    public function stream_eof()
    {
        return !is_resource($this->fp) || feof($this->fp);
    }

    public function stream_seek($offset, $whence = SEEK_SET)
    {
        return is_resource($this->fp) && fseek($this->fp, (int) $offset, (int) $whence) === 0;
    }

    public function stream_tell()
    {
        return is_resource($this->fp) ? (int) ftell($this->fp) : 0;
    }

    public function stream_flush()
    {
        return is_resource($this->fp) && fflush($this->fp);
    }

    public function stream_truncate($newSize)
    {
        return is_resource($this->fp) && ftruncate($this->fp, (int) $newSize);
    }

    public function stream_lock($operation)
    {
        $operation = (int) $operation;

        return $operation === 0 || !is_resource($this->fp) || flock($this->fp, $operation);
    }

    public function stream_stat()
    {
        return is_resource($this->fp) ? fstat($this->fp) : false;
    }

    public function stream_set_option($option, $arg1, $arg2)
    {
        return false;
    }

    public function stream_cast($castAs)
    {
        return $this->fp;
    }

    public function stream_close()
    {
        if (is_resource($this->fp)) {
            fclose($this->fp);
        }
    }

    public function url_stat($path, $flags)
    {
        self::disable();

        $flags = (int) $flags;
        $quiet = (bool) ($flags & STREAM_URL_STAT_QUIET);

        try {
            if ($quiet) {
                set_error_handler(static function (): bool {
                    return true;
                });
            }

            try {
                $result = ($flags & STREAM_URL_STAT_LINK) ? @lstat($path) : @stat($path);
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

    public function mkdir($path, $mode, $options)
    {
        self::disable();

        try {
            $recursive = (bool) ((int) $options & STREAM_MKDIR_RECURSIVE);

            return $this->context === null
                ? mkdir($path, (int) $mode, $recursive)
                : mkdir($path, (int) $mode, $recursive, $this->context);
        } finally {
            self::enable();
        }
    }

    public function rmdir($path, $options)
    {
        self::disable();

        try {
            return $this->context === null ? rmdir($path) : rmdir($path, $this->context);
        } finally {
            self::enable();
        }
    }

    public function rename($pathFrom, $pathTo)
    {
        self::disable();

        try {
            return $this->context === null
                ? rename($pathFrom, $pathTo)
                : rename($pathFrom, $pathTo, $this->context);
        } finally {
            self::enable();
        }
    }

    public function unlink($path)
    {
        self::disable();

        try {
            return $this->context === null ? unlink($path) : unlink($path, $this->context);
        } finally {
            self::enable();
        }
    }

    public function stream_metadata($path, $option, $value)
    {
        self::disable();

        try {
            switch ((int) $option) {
                case STREAM_META_TOUCH:
                    return $value === [] ? touch($path) : touch($path, ...array_values((array) $value));
                case STREAM_META_OWNER:
                case STREAM_META_OWNER_NAME:
                    return chown($path, $value);
                case STREAM_META_GROUP:
                case STREAM_META_GROUP_NAME:
                    return chgrp($path, $value);
                case STREAM_META_ACCESS:
                    return chmod($path, $value);
                default:
                    return false;
            }
        } finally {
            self::enable();
        }
    }

    public function dir_opendir($path, $options)
    {
        self::disable();

        try {
            $this->dir = $this->context === null ? opendir($path) : opendir($path, $this->context);
        } finally {
            self::enable();
        }

        return $this->dir !== false;
    }

    public function dir_readdir()
    {
        return is_resource($this->dir) ? readdir($this->dir) : false;
    }

    public function dir_rewinddir()
    {
        if (is_resource($this->dir)) {
            rewinddir($this->dir);
        }

        return true;
    }

    public function dir_closedir()
    {
        if (is_resource($this->dir)) {
            closedir($this->dir);
        }

        return true;
    }
}
