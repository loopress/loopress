<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

use Symfony\Component\Filesystem\Exception\IOExceptionInterface;
use Symfony\Component\Filesystem\Filesystem;

/**
 * A wp-content/loopress/<subdir>/ directory of single-class PHP files pushed by the CLI
 * (`lps api push`, `lps hook push`). wp-content/ is expected to be writable by the webserver,
 * unlike the plugin's own directory. Concrete subclasses only pick the subdir and expose
 * their own LOAD_ERRORS_OPTION for the loader/controller pair that reads it.
 */
abstract class AbstractFilesDirectory
{
    // Each concrete directory overrides both: SUBDIR is the wp-content/loopress/ folder name
    // and doubles as the 'api'/'hooks' label the loader and controller stamp on log lines,
    // route error strings and the tempnam() prefix. LOAD_ERRORS_OPTION is where the loader
    // records this boot's per-file failures for the controller to read back.
    public const SUBDIR = '';
    public const LOAD_ERRORS_OPTION = '';

    // Per-file ceiling. One single-class PHP route/hook file has no business being anywhere
    // near this; the point is that nothing hands token_get_all() / `php -l` / require() an
    // arbitrarily large blob (memory exhaustion is an uncatchable E_ERROR, see LP-SEC-02).
    // Enforced at push time (AbstractFilesController) and again at load time
    // (AbstractFileLoader), so a file planted straight on disk, outside the CLI, is bounded too.
    public const MAX_FILE_BYTES = 512 * 1024;

    // Last-resort guard for the whole directory: even with every file under MAX_FILE_BYTES,
    // hundreds of near-limit files would still cumulatively exhaust memory at boot. Generous
    // on purpose. A normal site never approaches it; a directory that does has almost
    // certainly been mass-populated by something other than `lps <resource> push`.
    public const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

    private string $path;
    private Filesystem $filesystem;

    // $filesystem is injectable only so a test can substitute a Filesystem double for one
    // specific failure mode that's otherwise impractical to reproduce on a real filesystem (see
    // ApiDirectoryTest's commitBatch() backup-cleanup-failure test); every real caller, PHP-DI
    // autowiring included, gets the same plain Filesystem() a bare `new ApiDirectory()` always
    // constructed before this parameter existed.
    public function __construct(?Filesystem $filesystem = null)
    {
        $this->path       = WP_CONTENT_DIR . '/loopress/' . static::SUBDIR . '/';
        $this->filesystem = $filesystem ?? new Filesystem();
    }

    /**
     * Runs $work while holding this directory's exclusive lock, so writers never interleave.
     * Without it, two overlapping batches share the one staging directory: the second
     * beginBatch() wipes the first's staging, the first commit moves it away, and the second
     * batch's next stageWrite() recreates an empty staging directory (dumpFile() creates
     * parents) holding only its own files, which its commit then swaps in as the whole live
     * set, deleting every other route/hook on the site. A single-file write or delete landing
     * between a batch's mirror and its commit would likewise be silently reverted.
     *
     * Blocking, not fail-fast: a second push waits for the first and then starts from its
     * result, where the expectedRevision preconditions still catch a real conflict. flock() is
     * released by the OS if PHP dies mid-batch, so a crash never leaves a stale lock behind.
     * Per-host only (like the rename() swap itself, see commitBatch()).
     *
     * @template T
     * @param callable(): T $work
     * @return T
     */
    public function exclusively(callable $work): mixed
    {
        $lockPath = rtrim($this->path, '/') . '.lock';
        if (!is_dir(dirname($lockPath))) {
            wp_mkdir_p(dirname($lockPath));
        }

        // Local lock file next to our own working directory, not a remote URL; flock() needs a
        // real stream handle, which WP_Filesystem doesn't provide.
        $handle = fopen($lockPath, 'c'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
        if ($handle === false || !flock($handle, LOCK_EX)) {
            throw new \RuntimeException(esc_html('Failed to lock ' . static::SUBDIR . ' for writing.'));
        }

        try {
            return $work();
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
        }
    }

    public function filePath(string $slug): string
    {
        return $this->path . $slug . '.php';
    }

    // Filterable, and passed the subdir so a filter can differ between api/ and hooks/.
    public function maxFileBytes(): int
    {
        return (int) apply_filters('loopress_max_file_bytes', self::MAX_FILE_BYTES, static::SUBDIR);
    }

    public function maxTotalBytes(): int
    {
        return (int) apply_filters('loopress_max_files_total_bytes', self::MAX_TOTAL_BYTES, static::SUBDIR);
    }

    // Size of a slug's file on disk in bytes, or null if it can't be determined (missing,
    // unreadable). Kept here so the size checks in the loader and the controller both go
    // through one place rather than each reaching for @filesize() on a path they build.
    public function fileSize(string $slug): ?int
    {
        return $this->fileSizeIn($this->filePath($slug));
    }

    // Same as fileSize(), for a slug in the staged batch instead of the live directory (used by
    // the controller's collision check against the batch's own state, see #236).
    public function stagedFileSize(string $slug): ?int
    {
        return $this->fileSizeIn($this->stagedFilePath($slug));
    }

    private function fileSizeIn(string $path): ?int
    {
        if (!is_file($path)) {
            return null;
        }

        $size = @filesize($path); // phpcs:ignore WordPress.PHP.NoSilencedErrors -- a race with deletion is expected here, not a bug
        return $size === false ? null : $size;
    }

    // Directory listing is blocked by an empty index.php (defense in depth); it doesn't
    // protect a request for a specific named file, that's what FileWriter's injected ABSPATH
    // guard is for.
    public function ensureExists(): void
    {
        if (!is_dir($this->path)) {
            wp_mkdir_p($this->path);
        }

        // Trivial static content, no concurrent-write concern unlike write() below: a plain
        // write is fine here, no need for dumpFile()'s atomic rename.
        DirectoryGuard::writeIndexIfMissing($this->path);
    }

    /**
     * @return string[] slugs: relative path without .php, e.g. ['hello', 'invoice-pdf/[order_id]']
     *   for <subdir>/hello.php and <subdir>/invoice-pdf/[order_id].php respectively.
     */
    public function listSlugs(): array
    {
        return $this->listSlugsIn($this->path);
    }

    public function read(string $slug): ?string
    {
        $path = $this->filePath($slug);
        if (!file_exists($path)) {
            return null;
        }

        // Local file under our own working directory, not a remote URL.
        $contents = file_get_contents($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        return $contents !== false ? $contents : null;
    }

    // dumpFile() writes to a temp file then renames, so a concurrent boot-time scan never
    // reads a half-written file.
    public function write(string $slug, string $content): void
    {
        $this->ensureExists();

        try {
            $this->filesystem->dumpFile($this->filePath($slug), $content);
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html("Failed to write {$slug}.php: " . $e->getMessage()));
        }
    }

    // Removes a single deployed file. Returns false when there was nothing to remove, so the
    // controller can answer 404 rather than a misleading 200. The slug is always a value that
    // has already passed the controller's filename validation (no '.' segments, extension never
    // client-supplied), so this only ever resolves inside the resource directory.
    public function delete(string $slug): bool
    {
        $path = $this->filePath($slug);
        if (!is_file($path)) {
            return false;
        }

        $this->filesystem->remove($path);
        return true;
    }

    // ── Batch staging / atomic swap (#236) ──────────────────────────────────────────────────
    //
    // write()/delete() above are already individually atomic (dumpFile()'s temp-file-then-
    // rename), but a *multi-file* push through AbstractFilesController is a sequence of
    // independent writes: a failure partway through leaves the live directory mixing old and
    // new files, discoverable only after the fact. The methods below let a caller stage a
    // whole batch in an inactive sibling directory, then swap it in with a single rename(),
    // so the live directory is at every instant either fully the old set or fully the new one.
    //
    // A sibling of $this->path, not nested inside it, so it never shows up in listSlugs()/
    // fileSize() scans of the live directory.
    private function stagingPath(): string
    {
        return rtrim($this->path, '/') . '.staging/';
    }

    private function stagedFilePath(string $slug): string
    {
        return $this->stagingPath() . $slug . '.php';
    }

    // Starts a batch: (re)creates the staging directory seeded with a copy of every file
    // currently live, so a file this batch never touches still exists after the swap. Any
    // leftover staging directory from a previous batch that never committed (a crashed
    // request) is discarded first, never merged into the new one.
    public function beginBatch(): void
    {
        $staging = $this->stagingPath();

        try {
            if (is_dir($staging)) {
                $this->filesystem->remove($staging);
            }

            wp_mkdir_p($staging);
            DirectoryGuard::writeIndexIfMissing($staging);

            if (is_dir($this->path)) {
                $this->filesystem->mirror($this->path, $staging);
            }
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html('Failed to prepare the staged batch: ' . $e->getMessage()));
        }
    }

    // Writes one file into the staged batch only, never the live directory. Same atomic
    // temp-file-then-rename as write(), scoped to the staging directory.
    public function stageWrite(string $slug, string $content): void
    {
        try {
            $this->filesystem->dumpFile($this->stagedFilePath($slug), $content);
        } catch (IOExceptionInterface $e) {
            throw new \RuntimeException(esc_html("Failed to stage {$slug}.php: " . $e->getMessage()));
        }
    }

    // Removes one file from the staged batch (used for a pruned slug), a no-op if it was never
    // there. Never touches the live directory.
    public function stageDelete(string $slug): void
    {
        $path = $this->stagedFilePath($slug);
        if (is_file($path)) {
            $this->filesystem->remove($path);
        }
    }

    // Reads a file back from the staged batch (its post-write content, or content mirrored
    // from the live directory and never touched by this batch), for pre-swap validation
    // (syntax/class-collision checks) to see the batch's own final state rather than only
    // what's live today. Null if the slug isn't in the batch (deleted, or never existed).
    public function readStaged(string $slug): ?string
    {
        $path = $this->stagedFilePath($slug);
        if (!file_exists($path)) {
            return null;
        }

        $contents = file_get_contents($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        return $contents !== false ? $contents : null;
    }

    /** @return string[] slugs currently in the staged batch, same shape as listSlugs(). */
    public function listStagedSlugs(): array
    {
        return $this->listSlugsIn($this->stagingPath());
    }

    // Atomically swaps the staged batch into place as the live directory. Two renames, each a
    // move to a path that does not yet exist (never an overwrite), so each one alone is a
    // single atomic filesystem operation: the live path is never a mix of old and new files.
    // There is a narrow instant between the two renames where the live path doesn't exist at
    // all (moved to $backup, not yet replaced by $staging); a request landing in that instant
    // sees an empty listSlugs()/read(), the same as a directory that hasn't been created yet,
    // never a partial one. Closing that gap fully needs a different primitive (a symlink swap,
    // or a rename-exchange syscall) than the plain directory rename() this method is built
    // around; not attempted here. (This also assumes wp-content/loopress/ lives on one
    // filesystem, same assumption write()'s own dumpFile() already makes; a network mount
    // spanning filesystems could make an individual rename() fall back to a non-atomic copy,
    // outside what this class can control.)
    //
    // On a failure swapping in the new set, the live directory is restored if it was already
    // moved aside, so a caller never observes a missing directory, and the staging directory is
    // left in place for inspection rather than silently discarded. Once the swap itself has
    // succeeded, the deployment is live: a failure removing the now-obsolete $backup below is a
    // cleanup problem, not a deployment one, and must never be reported as though the push
    // failed (see cleanupBackup()).
    public function commitBatch(): void
    {
        $staging = $this->stagingPath();
        if (!is_dir($staging)) {
            throw new \RuntimeException('commitBatch() called without a staged batch; call beginBatch() first.');
        }

        $backup = rtrim($this->path, '/') . '.old-' . uniqid('', true) . '/';

        try {
            if (is_dir($this->path)) {
                $this->filesystem->rename($this->path, $backup);
            }

            $this->filesystem->rename($staging, $this->path);
        } catch (IOExceptionInterface $e) {
            if (is_dir($backup) && !is_dir($this->path)) {
                $this->filesystem->rename($backup, $this->path);
            }

            throw new \RuntimeException(esc_html('Failed to swap in the new file set: ' . $e->getMessage()));
        }

        $this->cleanupBackup($backup);
    }

    // Best-effort removal of a commitBatch() backup, once the swap it belongs to has already
    // succeeded: a failure here (the old directory not fully removed, e.g. a permission quirk
    // on one leftover file) must never surface as a commitBatch() failure, since the deployment
    // itself already landed. A leftover `.old-*` directory is otherwise harmless: a sibling of
    // $this->path, never scanned by listSlugs()/read(), and each one uniquely named (uniqid()),
    // so it neither collides with nor is picked up by a later batch.
    private function cleanupBackup(string $backup): void
    {
        if (!is_dir($backup)) {
            return;
        }

        try {
            $this->filesystem->remove($backup);
        } catch (IOExceptionInterface) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
            // Deliberately swallowed: see the method comment above.
        }
    }

    // Discards a staged batch without ever touching the live directory: the counterpart to
    // commitBatch() for when staging itself failed partway through, or a caller decides not to
    // commit. A no-op if there is nothing staged.
    public function abortBatch(): void
    {
        $staging = $this->stagingPath();
        if (is_dir($staging)) {
            $this->filesystem->remove($staging);
        }
    }

    // Default: any index.php, at any depth, is never a slug. The anti-listing guard is only
    // ever written at the root (ensureExists(), beginBatch()), so ApiDirectory narrows this to
    // the root one: a nested api/orders/index.php is a route (/orders), not a guard.
    protected function isIgnoredFile(string $relativePath): bool
    {
        return basename($relativePath) === 'index.php';
    }

    // Shared walk behind listSlugs()/listStagedSlugs(): identical RecursiveIteratorIterator
    // scan, only the root directory differs.
    /** @return string[] */
    private function listSlugsIn(string $root): array
    {
        if (!is_dir($root)) {
            return [];
        }

        // RecursiveIteratorIterator defaults to LEAVES_ONLY: intermediate directories never
        // appear as their own entry, only actual files do.
        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );

        $slugs = [];
        foreach ($files as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }

            // getPathname() uses the platform's directory separator ('\' on Windows); a slug
            // is always explode()d on '/', so a slug carrying '\' would be read as one single
            // segment instead of the intended nested path.
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($file->getPathname(), strlen($root)));
            if ($this->isIgnoredFile($relative)) {
                continue;
            }

            $slugs[] = substr($relative, 0, -4); // strip the trailing '.php'
        }

        return $slugs;
    }
}
