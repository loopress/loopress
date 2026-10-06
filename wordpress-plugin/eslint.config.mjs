import reactConfig from '@loopress/eslint-config/react';

export default [
    { ignores: ['build', 'vendor', 'node_modules', 'assets'] },
    ...reactConfig,
    {
        rules: {
            // Destructuring a prop out to keep it from reaching `...rest` is intentional.
            '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
        },
    },
    {
        // Test doubles stand in for loosely typed WordPress globals and components.
        files: ['frontend/**/*.test.{ts,tsx}', 'frontend/wp-mocks.tsx', 'frontend/test-setup.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
];
