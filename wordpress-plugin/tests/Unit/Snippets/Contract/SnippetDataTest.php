<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Snippets\Contract;

use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetType;
use PHPUnit\Framework\TestCase;

class SnippetDataTest extends TestCase
{
    // ── fromArray ────────────────────────────────────────────────────────────

    public function test_from_array_maps_every_field(): void
    {
        $data = SnippetData::fromArray([
            'id'                  => 7,
            'name'                => 'Hello',
            'code'                => '<?php echo 1;',
            'type'                => 'php',
            'active'              => true,
            'description'         => 'A greeting',
            'tags'                => ['a', 'b'],
            'location'            => 'footer',
            'insertMethod'        => 'shortcode',
            'priority'            => 20,
            'shortcodeAttributes' => ['x' => '1'],
        ]);

        $this->assertSame(7, $data->id);
        $this->assertSame('Hello', $data->name);
        $this->assertSame('<?php echo 1;', $data->code);
        $this->assertSame(SnippetType::Php, $data->type);
        $this->assertTrue($data->active);
        $this->assertSame('A greeting', $data->description);
        $this->assertSame(['a', 'b'], $data->tags);
        $this->assertSame('footer', $data->location);
        $this->assertSame('shortcode', $data->insertMethod);
        $this->assertSame(20, $data->priority);
        $this->assertSame(['x' => '1'], $data->shortcodeAttributes);
    }

    public function test_from_array_leaves_every_field_null_when_absent(): void
    {
        $data = SnippetData::fromArray([]);

        $this->assertNull($data->id);
        $this->assertNull($data->name);
        $this->assertNull($data->code);
        $this->assertNull($data->type);
        $this->assertNull($data->active);
        $this->assertNull($data->description);
        $this->assertNull($data->tags);
        $this->assertNull($data->location);
        $this->assertNull($data->insertMethod);
        $this->assertNull($data->priority);
        $this->assertNull($data->shortcodeAttributes);
    }

    public function test_from_array_casts_a_numeric_string_id_to_int(): void
    {
        $data = SnippetData::fromArray(['id' => '42']);

        $this->assertSame(42, $data->id);
    }

    public function test_from_array_casts_a_numeric_string_priority_to_int(): void
    {
        $data = SnippetData::fromArray(['priority' => '15']);

        $this->assertSame(15, $data->priority);
    }

    // A present id of 0 must still produce an int 0, not null: isset() is true for 0, and
    // swapping the ternary branches would turn this into null.
    public function test_from_array_keeps_a_zero_id_as_int_zero(): void
    {
        $data = SnippetData::fromArray(['id' => 0]);

        $this->assertSame(0, $data->id);
    }

    public function test_from_array_converts_the_type_string_to_the_enum(): void
    {
        $this->assertSame(SnippetType::Css, SnippetData::fromArray(['type' => 'css'])->type);
    }

    public function test_from_array_rejects_an_unknown_type_string(): void
    {
        $this->expectException(\ValueError::class);
        SnippetData::fromArray(['type' => 'scss']);
    }

    // ── toArray ──────────────────────────────────────────────────────────────

    public function test_to_array_emits_every_populated_field_with_its_wire_key(): void
    {
        $data = new SnippetData(
            id: 7,
            name: 'Hello',
            code: '<?php',
            type: SnippetType::Js,
            active: false,
            description: 'desc',
            tags: ['t'],
            location: 'header',
            insertMethod: 'auto',
            priority: 5,
            shortcodeAttributes: ['k' => 'v'],
        );

        $this->assertSame([
            'id'                  => 7,
            'name'                => 'Hello',
            'code'                => '<?php',
            'type'                => 'js',
            'active'              => false,
            'description'         => 'desc',
            'tags'                => ['t'],
            'location'            => 'header',
            'insertMethod'        => 'auto',
            'priority'            => 5,
            'shortcodeAttributes' => ['k' => 'v'],
        ], $data->toArray());
    }

    public function test_to_array_serializes_the_type_as_its_string_value(): void
    {
        $this->assertSame('text', (new SnippetData(type: SnippetType::Text))->toArray()['type']);
    }

    public function test_to_array_drops_null_fields(): void
    {
        $this->assertSame(['id' => 1], (new SnippetData(id: 1))->toArray());
    }

    // array_filter drops null, but false and '' and 0 must survive: they are meaningful patch
    // values (deactivate, clear the description, top priority).
    public function test_to_array_keeps_falsy_but_non_null_fields(): void
    {
        $data = new SnippetData(active: false, description: '', priority: 0);

        $this->assertSame(['active' => false, 'description' => '', 'priority' => 0], $data->toArray());
    }

    public function test_to_array_on_an_empty_patch_is_an_empty_array(): void
    {
        $this->assertSame([], (new SnippetData())->toArray());
    }

    // ── round trip ───────────────────────────────────────────────────────────

    public function test_from_array_then_to_array_round_trips(): void
    {
        $wire = [
            'id'                  => 3,
            'name'                => 'Round',
            'code'                => 'trip',
            'type'                => 'html',
            'active'              => true,
            'description'         => 'd',
            'tags'                => ['x'],
            'location'            => 'everywhere',
            'insertMethod'        => 'shortcode',
            'priority'            => 99,
            'shortcodeAttributes' => ['a' => 'b'],
        ];

        $this->assertSame($wire, SnippetData::fromArray($wire)->toArray());
    }
}
