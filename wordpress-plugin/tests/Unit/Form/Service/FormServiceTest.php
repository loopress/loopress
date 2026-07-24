<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Form\Service;

use Loopress\Form\Contract\FormProvider;
use Loopress\Form\Exception\NoActiveFormPluginException;
use Loopress\Form\Service\FormService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class FormServiceTest extends TestCase
{
    private function provider(bool $active): FormProvider&MockObject
    {
        $provider = $this->createMock(FormProvider::class);
        $provider->method('isActive')->willReturn($active);

        return $provider;
    }

    public function test_is_active_false_when_no_provider_is_active(): void
    {
        $service = new FormService($this->provider(false), $this->provider(false));

        $this->assertFalse($service->isActive());
    }

    public function test_is_active_true_when_a_provider_is_active(): void
    {
        $service = new FormService($this->provider(false), $this->provider(true));

        $this->assertTrue($service->isActive());
    }

    public function test_delegates_to_the_first_active_provider(): void
    {
        $inactive = $this->provider(false);
        $inactive->expects($this->never())->method('list');

        $active = $this->provider(true);
        $forms  = [['id' => 1, 'settings' => ['form_title' => 'Contact']]];
        $active->method('list')->willReturn($forms);

        $service = new FormService($inactive, $active);

        $this->assertSame($forms, $service->list());
    }

    public function test_list_throws_when_no_provider_is_active(): void
    {
        $service = new FormService($this->provider(false));

        $this->expectException(NoActiveFormPluginException::class);
        $service->list();
    }

    public function test_list_throws_when_more_than_one_provider_is_active(): void
    {
        $first = $this->provider(true);
        $first->expects($this->never())->method('list');

        $second = $this->provider(true);
        $second->expects($this->never())->method('list');

        $service = new FormService($first, $second);

        $this->expectException(NoActiveFormPluginException::class);
        $this->expectExceptionMessage('Multiple form plugins are active');
        $service->list();
    }

    public function test_is_active_true_when_more_than_one_provider_is_active(): void
    {
        // isActive() only answers "is there a usable provider", it must not throw on its own;
        // the multi-provider conflict is only raised when a form operation is actually attempted.
        $service = new FormService($this->provider(true), $this->provider(true));

        $this->assertTrue($service->isActive());
    }

    public function test_create_delegates_to_active_provider(): void
    {
        $input  = ['settings' => ['form_title' => 'New']];
        $result = ['id' => 2, 'settings' => ['form_title' => 'New']];

        $active = $this->provider(true);
        $active->method('create')->with($input)->willReturn($result);

        $service = new FormService($active);

        $this->assertSame($result, $service->create($input));
    }

    public function test_update_delegates_to_active_provider(): void
    {
        $input  = ['settings' => ['form_title' => 'Updated']];
        $result = ['id' => 2, 'settings' => ['form_title' => 'Updated']];

        $active = $this->provider(true);
        $active->method('update')->with(2, $input)->willReturn($result);

        $service = new FormService($active);

        $this->assertSame($result, $service->update(2, $input));
    }

    public function test_get_delegates_to_active_provider(): void
    {
        $result = ['id' => 2, 'settings' => ['form_title' => 'Contact']];

        $active = $this->provider(true);
        $active->method('get')->with(2)->willReturn($result);

        $service = new FormService($active);

        $this->assertSame($result, $service->get(2));
    }

    public function test_delete_delegates_to_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('delete')->with(2)->willReturn(true);

        $service = new FormService($active);

        $this->assertTrue($service->delete(2));
    }

    public function test_delete_throws_when_no_provider_is_active(): void
    {
        $service = new FormService($this->provider(false));

        $this->expectException(NoActiveFormPluginException::class);
        $service->delete(2);
    }
}
