---
title: Detecting a Submission's Language in a WordPress Route Before It's Routed
description: A Custom API Route that identifies the language of an incoming contact form message with patrickschur/language-detection, so it reaches the right team without a customer picking a language dropdown.
kind: route
draft: true
---

A multilingual site's contact form is embedded on both the French and German versions of a page, but the language a visitor types their message in doesn't reliably match which version of the page they're looking at, someone browsing the German site in a hurry might still write in English. Routing the message to the right support queue by "which URL was this submitted from" gets it wrong often enough to matter. Detecting the language of the actual text is a more honest signal, and it's not something `WP_Query` or core has any notion of.

## Why this needs a package

Language identification from a short string is a statistical classification problem, comparing the text's character and word n-gram frequencies against trained profiles for each candidate language, not something expressible as a lookup table or a simple heuristic. [`patrickschur/language-detection`](https://packagist.org/packages/patrickschur/language-detection) ships with pre-trained n-gram profiles for around a hundred languages and does the comparison in pure PHP, no external API call, no per-request cost beyond the computation itself.

## The route

```php title="api/detect-language.php"
<?php

declare(strict_types=1);

use LanguageDetection\Language;

class DetectLanguage
{
    public function post(WP_REST_Request $request): array|WP_Error
    {
        $text = trim((string) $request->get_param('text'));
        if ($text === '') {
            return new WP_Error('missing_text', 'The text parameter is required.', ['status' => 400]);
        }

        // Restrict detection to the languages the site actually has queues for. Without a
        // list, ~100 profiles compete, and close relatives win on short text: this sentence's
        // runner-up is pt-BR, and "Merci beaucoup" comes back as Indonesian.
        // close() returns language code => score, highest first.
        $scores      = (new Language(['fr', 'de', 'en']))->detect($text)->close();
        $topLanguage = array_key_first($scores);

        return ['language' => $topLanguage, 'scores' => $scores];
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require patrickschur/language-detection
lps composer push
```

Short text is where this is weakest, not a defect so much as a property of statistical detection in general: a five-word message gives the classifier a lot less to work with than a paragraph, so a route calling this is better off treating the result as a routing hint, worth a second confidence-score check before trusting it blindly, than as ground truth for something like storing the visitor's language preference permanently.

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/detect-language \
  -H "Content-Type: application/json" \
  -d '{"text":"Bonjour, je voudrais signaler un problème avec ma commande."}'
```

```json
{"language": "fr", "scores": {"fr": 0.43236559139784947, "en": 0.4083870967741936, "de": 0.36379032258064514}}
```

Real output from patrickschur/language-detection 5.3. The scores are not probabilities and don't sum to 1: the winner leads by a couple of hundredths, not by a landslide. Short messages are where it breaks, `"Merci beaucoup"` returns `en` first (0.41 against 0.39 for `fr`), even with the list narrowed to three languages.

## Permission

Detecting the language of a piece of text a caller already supplies doesn't read or write anything else, so this stays public. The route that actually receives and stores the contact form submission, wherever it decides which support queue to route to based on this result, is where the real data-handling decisions belong.

## A missing package fails the one request, not the site

Without `patrickschur/language-detection` installed, `LanguageDetection\Language` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same detector fits anywhere content arrives without reliable language metadata attached, comment moderation queues, support ticket triage, tagging imported content by language automatically instead of by hand. It's also a small file, one detection call, one confidence check, that's a reasonable one to have an AI coding assistant draft, with the low-confidence-on-short-text caveat above being exactly the kind of behavior worth verifying against real sample messages rather than trusting a first pass on.
