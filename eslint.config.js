import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['out/**', 'release/**', 'node_modules/**', '*.config.js']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    settings: { react: { version: '18' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off'
    }
  }
];
