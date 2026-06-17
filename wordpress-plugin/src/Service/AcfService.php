<?php

namespace Loopress\Service;

class AcfService
{
    public function isAcfActive(): bool
    {
        return function_exists('acf_get_field_groups');
    }

    public function getFieldGroups(): array
    {
        $groups = acf_get_field_groups();

        return array_map(function (array $group): array {
            $group['fields'] = acf_get_fields($group['key']) ?: [];
            return $group;
        }, $groups);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function importFieldGroup(array $data): array
    {
        return acf_import_field_group($data);
    }
}
