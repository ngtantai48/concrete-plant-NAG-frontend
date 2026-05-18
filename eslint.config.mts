import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

export default defineConfig([
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "node_modules/**",

      ".claude/**",
      ".ida-mcp/**",
      ".qwen/**",
      ".vscode/**",
      ".idea/**",

      "renderer-pkg/**",

      "*.swp",
      "*.lcov",
      "*.tgz",
      "coverage/**",

      ".env",
      ".env*.local",
      "eslint.config.*",
      "next-env.d.ts",
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",

      "public/**",
      "**/*.d.ts",
      "**/*.css",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
  prettierConfig,
  {
    settings: { react: { version: "detect" } },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
]);
