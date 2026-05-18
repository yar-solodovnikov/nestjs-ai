import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'tests/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'eqeqeq': ['error', 'always'],

      '@typescript-eslint/no-magic-numbers': ['error', {
        ignore: [0, 1, -1],
        ignoreEnums: true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes: true,
        ignoreArrayIndexes: true,
        enforceConst: true,
      }],

      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      }],

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      '@typescript-eslint/explicit-module-boundary-types': 'warn',
    },
  },
)
