import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['out/', 'release/', 'node_modules/', 'tests/e2e/', 'scripts/', '*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 页面用 useEffect 触发异步 load()，setState 都在 await 之后；该规则看不到这点，误报多
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off'
    }
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }]
    }
  },
  {
    files: ['photoshop-plugin/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    },
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        document: 'readonly',
        localStorage: 'readonly',
        TextDecoder: 'readonly',
        console: 'readonly',
        decodeURIComponent: 'readonly'
      }
    }
  }
)
