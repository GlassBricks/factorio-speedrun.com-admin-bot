// @ts-check

import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  { ignores: ["**/*.js", "**/*.mjs", "**/*.cjs", "delete-command.ts"] },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/explicit-member-accessibility": ["error", { accessibility: "no-public" }],
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
)
