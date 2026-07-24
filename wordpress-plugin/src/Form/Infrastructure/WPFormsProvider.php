<?php

declare(strict_types=1);

namespace Loopress\Form\Infrastructure;

use Loopress\Form\Contract\FormProvider;

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
        if ($this->get($id) === null) {
            return null;
        }

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
}
