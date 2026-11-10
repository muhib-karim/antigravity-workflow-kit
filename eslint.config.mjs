// ESLint flat config (ESLint 10 + typescript-eslint 8). Replaces the old .eslintrc.json.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/', 'node_modules/', 'coverage/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            // v6 ignored unused catch bindings; keep that behaviour.
            '@typescript-eslint/no-unused-vars': ['warn', { caughtErrors: 'none' }],
            // `import x = require(...)` is the TypeScript form for the shared CommonJS matcher.
            '@typescript-eslint/no-require-imports': ['warn', { allowAsImport: true }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-empty-object-type': 'warn',
            '@typescript-eslint/no-unsafe-function-type': 'warn',
            '@typescript-eslint/no-wrapper-object-types': 'warn',
            'no-empty': 'warn',
            'no-useless-escape': 'warn',
        },
    },
);
