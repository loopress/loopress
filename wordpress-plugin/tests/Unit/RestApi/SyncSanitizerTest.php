<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\RestApi;

use Loopress\RestApi\SyncSanitizer;
use PHPUnit\Framework\TestCase;

class SyncSanitizerTest extends TestCase
{
    public function test_removes_a_script_block(): void
    {
        // The block is removed; surrounding whitespace is left as-is (no collapsing).
        $this->assertSame(
            'before  after',
            SyncSanitizer::stripActiveContent('before <script>alert(1)</script> after'),
        );
    }

    public function test_removes_an_unclosed_script_block_at_end_of_input(): void
    {
        $this->assertSame('ok ', SyncSanitizer::stripActiveContent('ok <script>alert(1)'));
    }

    public function test_removes_a_style_block(): void
    {
        $this->assertSame('x  y', SyncSanitizer::stripActiveContent('x <style>*{}</style> y'));
    }

    public function test_removes_inline_event_handlers_but_keeps_the_tag(): void
    {
        $this->assertSame(
            '<img src="x">',
            SyncSanitizer::stripActiveContent('<img src="x" onerror="alert(1)">'),
        );
        $this->assertSame(
            '<a href="/x">go</a>',
            SyncSanitizer::stripActiveContent('<a href="/x" onclick=steal()>go</a>'),
        );
    }

    public function test_defangs_a_javascript_uri_in_an_attribute(): void
    {
        $this->assertSame(
            '<a href="alert(1)">x</a>',
            SyncSanitizer::stripActiveContent('<a href="javascript:alert(1)">x</a>'),
        );
    }

    public function test_leaves_benign_html_and_text_byte_for_byte(): void
    {
        foreach (
            [
                '<p><strong>Bold</strong> and <em>italic</em>, with a <a href="https://example.com">link</a>.</p>',
                '%title% %sep% %sitename%',
                'Prix : 10 & plus, "guillemets", \'apostrophes\'',
                'A sentence mentioning the word javascript without a colon.',
                '',
            ] as $benign
        ) {
            $this->assertSame($benign, SyncSanitizer::stripActiveContent($benign));
        }
    }

    public function test_deep_recurses_into_arrays_and_leaves_keys_and_scalars_alone(): void
    {
        $input = [
            'onclick' => 'kept as a key',
            'title'   => 'Fine',
            'nested'  => ['msg' => 'hi <script>evil()</script>', 'count' => 3, 'flag' => true],
            'list'    => ['<b>ok</b>', '<img src=x onerror=alert(1)>'],
        ];

        $this->assertSame([
            'onclick' => 'kept as a key',
            'title'   => 'Fine',
            'nested'  => ['msg' => 'hi ', 'count' => 3, 'flag' => true],
            'list'    => ['<b>ok</b>', '<img src=x>'],
        ], SyncSanitizer::deep($input));
    }
}
