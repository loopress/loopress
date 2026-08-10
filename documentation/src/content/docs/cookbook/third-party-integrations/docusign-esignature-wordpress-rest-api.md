---
title: Sending a Contract for E-Signature from a WordPress Route with DocuSign
description: A Custom API Route that turns a generated contract into a DocuSign envelope ready to sign, using DocuSign's official PHP SDK, instead of a PDF attachment and an email thread waiting on "did they sign it yet."
kind: route
draft: true
---

An agency's client-facing site generates a service agreement from project details already in WordPress, scope, price, timeline, and needs to get it signed. Emailing a PDF attachment and waiting means no visibility into whether it was even opened, a print-sign-scan round trip if the client isn't comfortable with a digital signature tool of their own, and no reliable record of when consent actually happened, which matters more than it sounds once a dispute over scope shows up six months later.

## Why this needs a package

DocuSign's eSignature API is the standard for legally binding electronic signatures with an audit trail: who signed, when, from what IP, tamper-evident afterward. [DocuSign's official PHP SDK](https://packagist.org/packages/docusign/esign-client) (`docusign/esign-client`) wraps the envelope creation and recipient/signature-tab setup that would otherwise be a fair amount of specific JSON shape to get right by hand.

## Authentication is the part worth calling out separately

Unlike most integrations in this series, DocuSign doesn't authenticate with a single static API key. Production access uses JWT Grant: an RSA keypair registered with a DocuSign integration key, used to sign a JWT that's exchanged for a short-lived access token, refreshed on a schedule, not per request. That token acquisition is its own piece of infrastructure, not something worth cramming into a route file, so the route below assumes a valid access token is already sitting in an option, refreshed by a separate scheduled process, and focuses on the one thing that's actually route-shaped: building and sending the envelope.

## The route

```php title="api/send-for-signature/[project_id].php"
<?php

declare(strict_types=1);

// TODO: verify these exact class names and the ApiClient constructor signature against
// docusign/esign-client's current docs, the SDK follows DocuSign's standard eSignature
// object model but this wasn't confirmed against a live copy of the current README.
use DocuSign\eSign\Api\EnvelopesApi;
use DocuSign\eSign\Client\ApiClient;
use DocuSign\eSign\Model\Document;
use DocuSign\eSign\Model\EnvelopeDefinition;
use DocuSign\eSign\Model\SignHere;
use DocuSign\eSign\Model\Signer;
use DocuSign\eSign\Model\Tabs;

class SendForSignature
{
    public function post(WP_REST_Request $request): array|WP_Error
    {
        $projectId   = (int) $request->get_param('project_id');
        $contractPdf = get_post_meta($projectId, '_generated_contract_base64', true);
        $clientEmail = get_post_meta($projectId, '_client_email', true);
        $clientName  = get_post_meta($projectId, '_client_name', true);

        if (!is_string($contractPdf) || $contractPdf === '') {
            return new WP_Error('no_contract', 'This project has no generated contract yet.', ['status' => 422]);
        }

        $apiClient = new ApiClient();
        $apiClient->getConfig()->setHost((string) get_option('docusign_base_path'));
        $apiClient->getConfig()->setAccessToken((string) get_option('docusign_access_token'));

        $document = new Document([
            'document_base64' => $contractPdf,
            'name'            => 'Service Agreement',
            'file_extension'  => 'pdf',
            'document_id'     => '1',
        ]);

        $signHere = new SignHere(['document_id' => '1', 'page_number' => '1', 'x_position' => '100', 'y_position' => '150']);
        $signer   = new Signer([
            'email'         => $clientEmail,
            'name'          => $clientName,
            'recipient_id'  => '1',
            'tabs'          => new Tabs(['sign_here_tabs' => [$signHere]]),
        ]);

        $envelope = new EnvelopeDefinition([
            'email_subject' => 'Please sign your service agreement',
            'documents'     => [$document],
            'recipients'    => ['signers' => [$signer]],
            'status'        => 'sent',
        ]);

        $result = (new EnvelopesApi($apiClient))->createEnvelope((string) get_option('docusign_account_id'), $envelope);

        return ['envelope_id' => $result->getEnvelopeId()];
    }

    public function permission(WP_REST_Request $request): bool
    {
        $projectId = (int) $request->get_param('project_id');
        return current_user_can('edit_post', $projectId);
    }
}
```

```bash
composer require docusign/esign-client
lps composer push
```

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/send-for-signature/57 \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"envelope_id": "9e2ab1c4-3f7a-4e2b-9c1d-8a6f2b5e7d10"}
```

## Permission

Sending a contract is an action tied to one specific project, gated the same way editing that project already is, not a separate, looser check invented just for this route.

## A missing package fails the one request, not the site

Without `docusign/esign-client` installed, `ApiClient` is an undefined class, an ordinary PHP error scoped to this request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not a single package missing from an otherwise intact one, install it through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same envelope pattern covers any document needing a signature, a vendor agreement, a change order, once the underlying PDF already exists as data WordPress holds. It's also worth being honest about scope here: the JWT Grant token refresh this route depends on is real infrastructure, not a detail to wave away, exactly the kind of piece worth a human designing deliberately rather than delegating whole to an AI coding assistant, even though the envelope-building code above is narrow enough to be a reasonable first draft for one.
