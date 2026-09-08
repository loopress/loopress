<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Snippets\Contract;

use Loopress\Snippets\Contract\SnippetType;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class SnippetTypeTest extends TestCase
{
    /**
     * Pins the wire values: these strings are the REST contract, a provider maps its own
     * backend vocabulary to and from them, so a changed case value is a breaking change.
     */
    public function test_case_values_match_the_rest_wire_format(): void
    {
        $this->assertSame('php', SnippetType::Php->value);
        $this->assertSame('js', SnippetType::Js->value);
        $this->assertSame('css', SnippetType::Css->value);
        $this->assertSame('html', SnippetType::Html->value);
        $this->assertSame('text', SnippetType::Text->value);
    }

    public function test_from_rejects_an_unknown_value(): void
    {
        $this->expectException(\ValueError::class);
        SnippetType::from('scss');
    }

    /**
     * defaultLocation() is the fallback a provider uses when the stored location doesn't map
     * to a canonical one, so every arm of the match has to be exercised: CSS belongs in the
     * head, executable PHP runs everywhere, and everything else renders in the footer.
     */
    #[DataProvider('defaultLocationCases')]
    public function test_default_location_per_type(SnippetType $type, string $expected): void
    {
        $this->assertSame($expected, $type->defaultLocation());
    }

    /** @return array<string, array{SnippetType, string}> */
    public static function defaultLocationCases(): array
    {
        return [
            'css goes in the header'     => [SnippetType::Css, 'header'],
            'html goes in the footer'    => [SnippetType::Html, 'footer'],
            'js goes in the footer'      => [SnippetType::Js, 'footer'],
            'text goes in the footer'    => [SnippetType::Text, 'footer'],
            'php runs everywhere'        => [SnippetType::Php, 'everywhere'],
        ];
    }

    /**
     * The three footer types share one match arm; assert they are genuinely equal so a split
     * of that arm that changed only one of them would still be caught.
     */
    public function test_html_js_and_text_resolve_to_the_same_location(): void
    {
        $this->assertSame(SnippetType::Html->defaultLocation(), SnippetType::Js->defaultLocation());
        $this->assertSame(SnippetType::Js->defaultLocation(), SnippetType::Text->defaultLocation());
    }

    public function test_no_type_defaults_to_an_empty_location(): void
    {
        foreach (SnippetType::cases() as $type) {
            $this->assertNotSame('', $type->defaultLocation());
        }
    }
}
