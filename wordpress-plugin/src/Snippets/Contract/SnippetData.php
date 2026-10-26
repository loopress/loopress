<?php

declare(strict_types=1);

namespace Loopress\Snippets\Contract;

use Loopress\Infrastructure\Narrow;


/**
 * Immutable snapshot of a snippet's fields, shared by every SnippetProvider. Every property
 * is nullable so the same shape covers both a full snippet (as returned by getSnippet(),
 * getSnippets(), createSnippet(), updateSnippet()) and a partial patch (as passed into
 * updateSnippet(), where a null property means "leave this field unchanged") - mirroring the
 * isset($data[...]) checks the array-based version used for the same purpose.
 */
final readonly class SnippetData
{
    /**
     * @param string[]|null $tags
     * @param string[]|null $shortcodeAttributes
     */
    public function __construct(
        public ?int $id = null,
        public ?string $name = null,
        public ?string $code = null,
        public ?SnippetType $type = null,
        public ?bool $active = null,
        public ?string $description = null,
        public ?array $tags = null,
        public ?string $location = null,
        public ?string $insertMethod = null,
        public ?int $priority = null,
        public ?array $shortcodeAttributes = null,
        // Opaque content hash of every field above except id (see SnippetService::revisionOf()),
        // only ever compared for equality (#234). Computed by SnippetService, never accepted as
        // patch input: fromArray() deliberately doesn't read a "revision" key, so a client can't
        // set it through create/update, only receive it back on a read.
        public ?string $revision = null,
    ) {
    }

    /**
     * Builds a SnippetData from the REST request shape (loopress/v1/snippets JSON body):
     * field names match 1:1, only `type` needs converting from its wire string to the enum.
     *
     * @param array<string, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        $string  = static fn(string $key): ?string => isset($data[$key]) ? Narrow::string($data[$key]) : null;
        $strings = static function (string $key) use ($data): ?array {
            $value = $data[$key] ?? null;

            return is_array($value) ? array_filter($value, 'is_string') : null;
        };
        // tags is a list: reindexed so a dropped entry can't turn it into a JSON object.
        // shortcodeAttributes is a name => value map and keeps its keys.
        $tags = $strings('tags');

        return new self(
            id: isset($data['id']) ? Narrow::int($data['id']) : null,
            name: $string('name'),
            code: $string('code'),
            type: isset($data['type']) ? SnippetType::from(Narrow::string($data['type'])) : null,
            active: isset($data['active']) ? (bool) $data['active'] : null,
            description: $string('description'),
            tags: $tags === null ? null : array_values($tags),
            location: $string('location'),
            insertMethod: $string('insertMethod'),
            priority: isset($data['priority']) ? Narrow::int($data['priority']) : null,
            shortcodeAttributes: $strings('shortcodeAttributes'),
        );
    }

    /**
     * Mirrors fromArray(): the exact same JSON shape the REST API exposed before this
     * value object existed. Null fields are dropped rather than serialized, matching the
     * "field absent" convention fromArray() itself reads back.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return array_filter([
            'id'                  => $this->id,
            'name'                => $this->name,
            'code'                => $this->code,
            'type'                => $this->type?->value,
            'active'              => $this->active,
            'description'         => $this->description,
            'tags'                => $this->tags,
            'location'            => $this->location,
            'insertMethod'        => $this->insertMethod,
            'priority'            => $this->priority,
            'shortcodeAttributes' => $this->shortcodeAttributes,
            'revision'            => $this->revision,
        ], static fn(mixed $value): bool => $value !== null);
    }
}
