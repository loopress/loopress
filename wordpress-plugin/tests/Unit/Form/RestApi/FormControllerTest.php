<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Form\RestApi;

use Brain\Monkey;
use Loopress\Form\Exception\FormNotificationException;
use Loopress\Form\Exception\NoActiveFormPluginException;
use Loopress\Form\Exception\StaleFormRevisionException;
use Loopress\Form\RestApi\FormController;
use Loopress\Form\Service\FormService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class FormControllerTest extends TestCase
{
    private FormController $controller;
    private FormService&MockObject $formService;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->formService = $this->createMock(FormService::class);
        $this->formService->method('isActive')->willReturn(true);
        $this->controller  = new FormController($this->formService);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    /** @param array<string, mixed> $routeParams @param array<string, mixed>|null $jsonBody */
    private function request(array $routeParams = [], ?array $jsonBody = null): WP_REST_Request
    {
        $request = new WP_REST_Request($routeParams);
        if ($jsonBody !== null) {
            $request->set_json_params($jsonBody);
        }

        return $request;
    }

    // ── inactive provider ────────────────────────────────────────────────────

    public function test_list_forms_returns_409_when_no_form_plugin_is_active(): void
    {
        $this->formService = $this->createMock(FormService::class);
        $this->formService->method('isActive')->willReturn(false);
        $this->controller = new FormController($this->formService);

        $response = $this->controller->list_forms();

        $this->assertSame(409, $response->status);
    }

    // ── list ─────────────────────────────────────────────────────────────────

    public function test_list_forms_returns_the_service_result(): void
    {
        $this->formService->method('list')->willReturn([['id' => 1, 'settings' => ['form_title' => 'Contact']]]);

        $response = $this->controller->list_forms();

        $this->assertSame(200, $response->status);
        $this->assertSame([['id' => 1, 'settings' => ['form_title' => 'Contact']]], $response->data);
    }

    // ── get ──────────────────────────────────────────────────────────────────

    public function test_get_form_returns_404_when_not_found(): void
    {
        $this->formService->method('get')->willReturn(null);

        $response = $this->controller->get_form($this->request(['id' => 999]));

        $this->assertSame(404, $response->status);
    }

    public function test_get_form_returns_200_with_the_form(): void
    {
        $this->formService->method('get')->with(2)
            ->willReturn(['id' => 2, 'settings' => ['form_title' => 'Contact'], 'revision' => 'rev-1']);

        $response = $this->controller->get_form($this->request(['id' => 2]));

        $this->assertSame(200, $response->status);
        $this->assertSame(['id' => 2, 'settings' => ['form_title' => 'Contact'], 'revision' => 'rev-1'], $response->data);
    }

    // ── create ───────────────────────────────────────────────────────────────

    public function test_create_form_returns_400_when_the_body_is_empty(): void
    {
        $this->formService->expects($this->never())->method('create');

        $response = $this->controller->create_form($this->request());

        $this->assertSame(400, $response->status);
    }

    public function test_create_form_returns_201_with_the_created_form(): void
    {
        $this->formService->expects($this->once())->method('create')
            ->with(['settings' => ['form_title' => 'New']])
            ->willReturn(['id' => 2, 'settings' => ['form_title' => 'New'], 'revision' => 'rev-1']);

        $response = $this->controller->create_form($this->request([], ['settings' => ['form_title' => 'New']]));

        $this->assertSame(201, $response->status);
        $this->assertSame(['id' => 2, 'settings' => ['form_title' => 'New'], 'revision' => 'rev-1'], $response->data);
    }

    // ── update ───────────────────────────────────────────────────────────────

    public function test_update_form_returns_400_when_the_body_is_empty(): void
    {
        $this->formService->expects($this->never())->method('update');

        $response = $this->controller->update_form($this->request(['id' => 2]));

        $this->assertSame(400, $response->status);
    }

    public function test_update_form_returns_400_when_the_json_body_is_null(): void
    {
        $this->formService->expects($this->never())->method('update');

        $request = new WP_REST_Request(['id' => 2]);
        $request->set_json_params(null);

        $response = $this->controller->update_form($request);

        $this->assertSame(400, $response->status);
    }

    public function test_update_form_returns_404_when_not_found(): void
    {
        $this->formService->method('update')->willReturn(null);

        $response = $this->controller->update_form($this->request(['id' => 999], ['settings' => ['form_title' => 'Updated']]));

        $this->assertSame(404, $response->status);
    }

    public function test_update_form_returns_200_with_the_updated_form(): void
    {
        $this->formService->expects($this->once())
            ->method('update')
            ->with(2, ['settings' => ['form_title' => 'Updated']], null)
            ->willReturn(['id' => 2, 'settings' => ['form_title' => 'Updated'], 'revision' => 'rev-2']);

        $response = $this->controller->update_form($this->request(['id' => 2], ['settings' => ['form_title' => 'Updated']]));

        $this->assertSame(200, $response->status);
        $this->assertSame(['id' => 2, 'settings' => ['form_title' => 'Updated'], 'revision' => 'rev-2'], $response->data);
    }

    // ── update: conditional write (#234) ────────────────────────────────────

    public function test_update_form_forwards_expected_revision_from_the_request_body(): void
    {
        $this->formService->expects($this->once())
            ->method('update')
            ->with(2, ['settings' => ['form_title' => 'Updated']], 'rev-1')
            ->willReturn(['id' => 2, 'settings' => ['form_title' => 'Updated'], 'revision' => 'rev-2']);

        $response = $this->controller->update_form($this->request(
            ['id' => 2],
            ['settings' => ['form_title' => 'Updated'], 'expectedRevision' => 'rev-1'],
        ));

        $this->assertSame(200, $response->status);
    }

    public function test_update_form_passes_null_when_no_expected_revision_is_given(): void
    {
        $this->formService->expects($this->once())
            ->method('update')
            ->with(2, ['settings' => ['form_title' => 'Updated']], null)
            ->willReturn(['id' => 2, 'settings' => ['form_title' => 'Updated'], 'revision' => 'rev-1']);

        $this->controller->update_form($this->request(['id' => 2], ['settings' => ['form_title' => 'Updated']]));
        $this->addToAssertionCount(1);
    }

    public function test_update_form_passes_null_when_expected_revision_is_explicitly_null(): void
    {
        $this->formService->expects($this->once())
            ->method('update')
            ->with(2, ['settings' => ['form_title' => 'Updated']], null)
            ->willReturn(['id' => 2, 'settings' => ['form_title' => 'Updated'], 'revision' => 'rev-1']);

        $this->controller->update_form($this->request(
            ['id' => 2],
            ['settings' => ['form_title' => 'Updated'], 'expectedRevision' => null],
        ));
        $this->addToAssertionCount(1);
    }

    // Regression coverage (#234): a malformed expectedRevision must be rejected, never silently
    // dropped, a client that (accidentally or otherwise) sent something other than a string would
    // otherwise have the conditional-write precondition disabled entirely instead of getting a
    // clear error, and update() would run as if no precondition had been requested.
    public function test_update_form_returns_400_when_expected_revision_is_not_a_string(): void
    {
        $this->formService->expects($this->never())->method('update');

        $response = $this->controller->update_form($this->request(
            ['id' => 2],
            ['settings' => ['form_title' => 'Updated'], 'expectedRevision' => 12_345],
        ));

        $this->assertSame(400, $response->status);
    }

    // Regression coverage (#234): a body that carries nothing but the control flag must still be
    // rejected as empty, not forwarded to update() as a content-erasing write.
    public function test_update_form_returns_400_when_the_body_holds_only_expected_revision(): void
    {
        $this->formService->expects($this->never())->method('update');

        $response = $this->controller->update_form($this->request(['id' => 2], ['expectedRevision' => 'rev-1']));

        $this->assertSame(400, $response->status);
    }

    public function test_update_form_returns_412_when_the_expected_revision_is_stale(): void
    {
        $this->formService->method('update')->willThrowException(
            new StaleFormRevisionException('Form #2 changed on WordPress since it was last read.'),
        );

        $response = $this->controller->update_form($this->request(
            ['id' => 2],
            ['settings' => ['form_title' => 'Updated'], 'expectedRevision' => 'stale-revision'],
        ));

        $this->assertSame(412, $response->status);
        $this->assertSame(['error' => 'Form #2 changed on WordPress since it was last read.'], $response->data);
    }

    // ── delete ───────────────────────────────────────────────────────────────

    public function test_delete_form_returns_404_when_not_found(): void
    {
        $this->formService->method('delete')->willReturn(false);

        $response = $this->controller->delete_form($this->request(['id' => 999]));

        $this->assertSame(404, $response->status);
    }

    public function test_delete_form_returns_204_when_deleted(): void
    {
        $this->formService->expects($this->once())->method('delete')->with(2)->willReturn(true);

        $response = $this->controller->delete_form($this->request(['id' => 2]));

        $this->assertSame(204, $response->status);
    }

    // ── domain exceptions ────────────────────────────────────────────────────

    public function test_list_forms_returns_409_when_the_service_reports_no_active_provider(): void
    {
        $this->formService->method('list')->willThrowException(
            new NoActiveFormPluginException('No supported form plugin is active.'),
        );

        $response = $this->controller->list_forms();

        $this->assertSame(409, $response->status);
    }

    public function test_update_form_returns_422_for_a_rejected_notification(): void
    {
        $this->formService->method('update')->willThrowException(
            new FormNotificationException('Notification recipient "not-an-email" is not a valid email address.'),
        );

        $response = $this->controller->update_form($this->request(['id' => 2], ['settings' => ['form_title' => 'Updated']]));

        $this->assertSame(422, $response->status);
    }
}
