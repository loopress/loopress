<?php

declare(strict_types=1);

namespace Loopress\Contract;

interface Module
{
    public function boot(): void;
}
