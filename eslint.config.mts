import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettierConfig,
  {
    settings: {
      react: {
        version: "19.2.5",
      },
    },
  },
  {
    ignores: [
      ".next/**",
      ".claude/**",
      ".ida-mcp/**",
      ".qwen/**",
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
]);
