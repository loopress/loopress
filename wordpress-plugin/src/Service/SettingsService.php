<?php

namespace Loopress\Service;

class SettingsService
{
    public function getSettings(): array
    {
        return [
            'environment' => $this->getEnvironment(),
        ];
    }

    public function getEnvironment(): string
    {
        if (defined('LOOPRESS_ENVIRONMENT')) {
            return LOOPRESS_ENVIRONMENT;
        }
        return 'development';
    }
}
