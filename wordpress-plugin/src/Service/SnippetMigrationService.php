<?php

namespace Loopress\Service;

use Loopress\Contract\SnippetProvider;

// Deliberately not built on top of SnippetService: that class requires exactly one
// provider to be active (see requireActiveProvider()), which is the right invariant for
// the CLI-facing CRUD it serves, but incompatible with a migration that inherently needs
// both the source and the destination active at once. This holds the two providers by
// fixed role instead of scanning a pool for "the active one".
class SnippetMigrationService
{
    public function __construct(
        private SnippetProvider $source,
        private SnippetProvider $destination,
    ) {}

    public function sourceActive(): bool
    {
        return $this->source->isActive();
    }

    public function destinationActive(): bool
    {
        return $this->destination->isActive();
    }

    public function isReady(): bool
    {
        return $this->sourceActive() && $this->destinationActive();
    }

    /** @return array<int, array<string, mixed>> */
    public function getMigratableSnippets(): array
    {
        return $this->sourceActive() ? $this->source->getSnippets() : [];
    }

    /**
     * @param int[] $ids
     * @return array<int, array{id: int, status: string, error?: string, warning?: string}>
     */
    public function migrate(array $ids): array
    {
        if (!$this->isReady()) {
            throw new \RuntimeException('Both a source and destination snippet plugin must be active to migrate.');
        }

        return array_map(fn(int $id): array => $this->migrateOne($id), array_values(array_unique($ids)));
    }

    /** @return array{id: int, status: string, error?: string, warning?: string} */
    private function migrateOne(int $id): array
    {
        $snippet = $this->source->getSnippet($id);
        if ($snippet === null) {
            return ['id' => $id, 'status' => 'error', 'error' => 'Snippet not found.'];
        }

        try {
            $this->destination->createSnippet($snippet);
        } catch (\RuntimeException $e) {
            return ['id' => $id, 'status' => 'error', 'error' => $e->getMessage()];
        }

        try {
            $this->source->updateSnippet($id, ['active' => false]);
        } catch (\RuntimeException $e) {
            // The copy already exists at the destination at this point: reporting 'error'
            // here would invite a retry that duplicates it. Surface a warning instead so
            // the admin knows to deactivate the WPCode original by hand.
            return [
                'id'      => $id,
                'status'  => 'migrated',
                'warning' => 'Copied, but could not deactivate the original: ' . $e->getMessage(),
            ];
        }

        return ['id' => $id, 'status' => 'migrated'];
    }
}
