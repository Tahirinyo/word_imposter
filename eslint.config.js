import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'functions/node_modules/**',
            'functions/data/words.json',
            '.firebase/**'
        ]
    },
    js.configs.recommended,
    {
        files: ['src/**/*.js', 'scripts/**/*.mjs', 'vite.config.js', 'eslint.config.js', 'tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        rules: {
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
        }
    },
    {
        files: ['functions/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
        }
    }
];
