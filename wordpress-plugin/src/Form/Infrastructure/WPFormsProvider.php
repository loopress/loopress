<?php

declare(strict_types=1);

namespace Loopress\Form\Infrastructure;

use Loopress\Form\Contract\FormProvider;
use Loopress\Form\Exception\FormNotificationException;
use Loopress\RestApi\SyncSanitizer;

// Function/class signatures for wpforms()/WPForms_Form_Handler are stubbed for static analysis
// in wpforms-stubs.php, verified directly against WPForms Lite's own source (see that file's
// header comment). Forms are identified by their numeric WP post ID (no ACF-style stable key).
class WPFormsProvider implements FormProvider
{
    public function isActive(): bool
    {
        return function_exists('wpforms');
    }

    /** @return array<int, array<string, mixed>> */
    public function list(): array
    {
        $forms = wpforms()->form->get('', ['orderby' => 'ID']);

        return is_array($forms) ? array_map(fn(\WP_Post $form): array => $this->toCanonical($form), $forms) : [];
    }

    /** @return array<string, mixed>|null */
    public function get(int $id): ?array
    {
        $form = get_post($id);

        return $form instanceof \WP_Post && in_array($form->post_type, ['wpforms'], true)
            ? $this->toCanonical($form)
            : null;
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function create(array $data): array
    {
        $data = $this->sanitizeFormData($data, null);

        // wpforms()->form->add() only ever writes a default title/description scaffold, it
        // never persists the caller's field/settings payload (that only happens on the
        // form-builder UI's own "outside builder" code path, which requires a data['builder']
        // flag this REST call has no reason to set). A follow-up update() is required to
        // actually store the pushed content, the same two-step dance WPForms' own add()
        // performs internally for its "outside builder" case.
        $formId = wpforms()->form->add($this->extractTitle($data), [], []);
        if (!$formId) {
            throw new \RuntimeException('Failed to create the WPForms form.');
        }

        $data['id'] = $formId;
        if (wpforms()->form->update($formId, $data) === false) {
            throw new \RuntimeException('Failed to save the new WPForms form\'s content.');
        }

        return $this->get($formId) ?? array_merge($data, ['id' => $formId]);
    }

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function update(int $id, array $data): ?array
    {
        $existing = $this->get($id);
        if ($existing === null) {
            return null;
        }

        $data = $this->sanitizeFormData($data, $existing);
        $data['id'] = $id;
        if (wpforms()->form->update($id, $data) === false) {
            throw new \RuntimeException('Failed to update the WPForms form.');
        }

        return $this->get($id);
    }

    public function delete(int $id): bool
    {
        if ($this->get($id) === null) {
            return false;
        }

        if (wpforms()->form->delete([$id]) === false) {
            throw new \RuntimeException('Failed to delete the WPForms form.');
        }

        return true;
    }

    // wpforms()->form->get()'s own content_only decode filters to published forms only by
    // default (see WPForms_Form_Handler::get()'s $defaults), which would make a form invisible
    // to `get()` right after `create()` if WPForms ever changed that default; decoding the
    // post_content ourselves via the ID we already have avoids depending on that default.
    /** @return array<string, mixed> */
    private function toCanonical(\WP_Post $form): array
    {
        $data = wpforms_decode($form->post_content);
        $data = is_array($data) ? $data : [];
        $data['id'] = $form->ID;

        return $data;
    }

    /** @param array<string, mixed> $data */
    private function extractTitle(array $data): string
    {
        $title = $data['settings']['form_title'] ?? null;

        return is_string($title) && trim($title) !== '' ? $title : 'Untitled Form';
    }

    /**
     * A pushed form's `settings.notifications` / `settings.confirmations` are stored verbatim
     * into post_content and drive where every submission is emailed and what the submitter
     * sees. A leaked token could point notifications at an attacker inbox with a spoofed
     * sender and a `{all_fields}` body (an authenticated exfil + spam relay, confirmed in the
     * pentest), so overwriting either section is opt-in: the request must carry
     * `"allowNotifications": true`. Without it, the section on the server is kept (or, on
     * create, dropped so WPForms adds its own default). With it, recipients and senders are
     * validated and message bodies are stripped of active content.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed>|null $existing the form's current canonical data, on update
     * @return array<string, mixed>
     */
    private function sanitizeFormData(array $data, ?array $existing): array
    {
        $allow = ($data['allowNotifications'] ?? null) === true;
        unset($data['allowNotifications']); // a control flag, never persisted into the form

        /** @var array<string, mixed> $existingSettings */
        $existingSettings = [];
        if (is_array($existing) && isset($existing['settings']) && is_array($existing['settings'])) {
            $existingSettings = $existing['settings'];
        }

        foreach (['notifications', 'confirmations'] as $section) {
            if (!isset($data['settings'][$section]) || !is_array($data['settings'][$section])) {
                continue;
            }

            if (!$allow) {
                $kept = $existingSettings[$section] ?? null;
                if (is_array($kept)) {
                    $data['settings'][$section] = $kept;
                } else {
                    unset($data['settings'][$section]);
                }

                continue;
            }

            $data['settings'][$section] = $section === 'notifications'
                ? $this->validateNotifications($data['settings'][$section])
                : $this->sanitizeConfirmations($data['settings'][$section]);
        }

        return $data;
    }

    /**
     * @param array<array-key, mixed> $notifications keyed by WPForms notification id
     * @return array<array-key, mixed>
     */
    private function validateNotifications(array $notifications): array
    {
        foreach ($notifications as $id => $notification) {
            if (!is_array($notification)) {
                continue;
            }

            $this->assertValidRecipients($notification['email'] ?? '');
            $this->assertOwnSenderAddress($notification['sender_address'] ?? '');

            foreach (['sender_name', 'subject', 'replyto', 'carboncopy'] as $textField) {
                if (isset($notification[$textField]) && is_string($notification[$textField])) {
                    $notification[$textField] = sanitize_text_field($notification[$textField]);
                }
            }

            if (isset($notification['message']) && is_string($notification['message'])) {
                $notification['message'] = SyncSanitizer::stripActiveContent($notification['message']);
            }

            $notifications[$id] = $notification;
        }

        return $notifications;
    }

    /**
     * @param array<array-key, mixed> $confirmations keyed by WPForms confirmation id
     * @return array<array-key, mixed>
     */
    private function sanitizeConfirmations(array $confirmations): array
    {
        foreach ($confirmations as $id => $confirmation) {
            if (!is_array($confirmation)) {
                continue;
            }

            if (isset($confirmation['message']) && is_string($confirmation['message'])) {
                $confirmation['message'] = SyncSanitizer::stripActiveContent($confirmation['message']);
            }

            if (isset($confirmation['redirect']) && is_string($confirmation['redirect'])) {
                $confirmation['redirect'] = esc_url_raw($confirmation['redirect']);
            }

            $confirmations[$id] = $confirmation;
        }

        return $confirmations;
    }

    // Recipients may be a comma-separated list mixing literal addresses and WPForms smart tags
    // ({admin_email}, {field_id="5"}). Smart tags are left to WPForms to resolve; every literal
    // part must be a real address.
    private function assertValidRecipients(mixed $recipients): void
    {
        if (!is_string($recipients) || trim($recipients) === '') {
            return;
        }

        foreach (explode(',', $recipients) as $part) {
            $part = trim($part);
            if ($part === '' || $this->isSmartTag($part)) {
                continue;
            }

            if (!is_email($part)) {
                throw new FormNotificationException(esc_html(
                    "Notification recipient \"{$part}\" is not a valid email address."
                ));
            }
        }
    }

    // A `From` address on a domain other than the site's own is spoofing, and a common way to
    // route replies to an attacker. An empty value or a smart tag ({admin_email}) is fine.
    private function assertOwnSenderAddress(mixed $sender): void
    {
        if (!is_string($sender) || trim($sender) === '' || $this->isSmartTag(trim($sender))) {
            return;
        }

        $sender   = trim($sender);
        $siteHost = strtolower((string) wp_parse_url((string) get_option('siteurl'), PHP_URL_HOST));
        $atPos    = strrpos($sender, '@');
        $host     = $atPos === false ? '' : strtolower(substr($sender, $atPos + 1));

        if (!is_email($sender) || $host === '' || $siteHost === '' || $host !== $siteHost) {
            throw new FormNotificationException(esc_html(
                "Notification sender_address \"{$sender}\" must be an address on this site's own domain ({$siteHost})."
            ));
        }
    }

    private function isSmartTag(string $value): bool
    {
        return str_starts_with($value, '{') && str_ends_with($value, '}');
    }
}
