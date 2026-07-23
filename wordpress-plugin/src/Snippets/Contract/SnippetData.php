<?php

declare(strict_types=1);

namespace Loopress\Snippets\Contract;

/**
 * Immutable snapshot of a snippet's fields, shared by every SnippetProvider. Every property
 * is nullable so the same shape covers both a full snippet (as returned by getSnippet(),
 * getSnippets(), createSnippet(), updateSnippet()) and a partial patch (as passed into
 * updateSnippet(), where a null property means "leave this field unchanged") - mirroring the
 * isset($data[...]) checks the array-based version used for the same purpose.
 */
final class SnippetData
{
    /**
     * @param string[]|null $tags
     * @param string[]|null $shortcodeAttributes
     */
    public function __construct(
        public readonly ?int $id = null,
        public readonly ?string $name = null,
        public readonly ?string $code = null,
        public readonly ?SnippetType $type = null,
        public readonly ?bool $active = null,
        public readonly ?string $description = null,
        public readonly ?array $tags = null,
        public readonly ?string $location = null,
        public readonly ?string $insertMethod = null,
        public readonly ?int $priority = null,
        public readonly ?array $shortcodeAttributes = null,
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
        return new self(
            id: isset($data['id']) ? (int) $data['id'] : null,
            name: $data['name'] ?? null,
            code: $data['code'] ?? null,
            type: isset($data['type']) ? SnippetType::from($data['type']) : null,
            active: $data['active'] ?? null,
            description: $data['description'] ?? null,
            tags: $data['tags'] ?? null,
            location: $data['location'] ?? null,
            insertMethod: $data['insertMethod'] ?? null,
            priority: isset($data['priority']) ? (int) $data['priority'] : null,
            shortcodeAttributes: $data['shortcodeAttributes'] ?? null,
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
        ], static fn(mixed $value): bool => $value !== null);
    }
}
