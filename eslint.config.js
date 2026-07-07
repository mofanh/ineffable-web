import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'alert',
          message:
            'Use the app notification service from src/lib/app/notifications instead of window.alert.',
        },
        {
          object: 'window',
          property: 'confirm',
          message:
            'Use the app confirmation service from src/lib/app/confirm instead of window.confirm.',
        },
      ],
    },
  },
])
