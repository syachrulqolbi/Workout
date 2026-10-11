import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['features/**/*.{ts,tsx}', 'lib/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/lib/server/**'],
          message: 'Browser and feature modules must not import server-only infrastructure.',
        }],
      }],
    },
  },
  {
    files: ['lib/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/lib/client/**', '@/features/**'],
          message: 'Server modules must not depend on browser or feature UI modules.',
        }],
      }],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
