import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
<<<<<<< Updated upstream
  js.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,

  ...compat.config({
    extends: ['next', 'prettier', 'next/core-web-vitals'],
  }),
=======
  {
    ignores: [
      ".next/**",
      ".claude/**",
      ".ida-mcp/**",
      ".qwen/**",
      "renderer-pkg/**",
      "eslint.config.*",
      "out/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "*.lcov",
      "*.tgz",
      "**/*.css",
      "**/*.d.ts",
      ".vscode/**",
      ".idea/**",
      "*.swp",
      "next-env.d.ts",
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",
    ],
  },
>>>>>>> Stashed changes
]);
