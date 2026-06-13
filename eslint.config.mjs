// eslint.config.mts
import withNuxt from "./.nuxt/eslint.config.mjs";
import eslintConfigPrettier from "eslint-config-prettier";

export default withNuxt([
  {
    ignores: ["**/*.d.ts", "**/coverage", "**/dist", "**/node_modules"],
  },
  {
    rules: {
      "no-var": "error",
      "no-unused-vars": "off",
      "no-empty-function": "error",
      "no-console": [
        "error",
        {
          allow: ["info", "warn", "error"],
        },
      ],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "object-shorthand": ["error", "always"],
      "func-style": ["error", "declaration", { allowArrowFunctions: true }],
      "comma-dangle": ["error", "always-multiline"],
      quotes: ["error", "single", { avoidEscape: true }],
      semi: ["error", "always"],
      curly: ["error", "multi", "consistent"],
      "no-nested-ternary": "error",
      "prefer-template": "error",
      "prefer-arrow-callback": ["error", { allowNamedFunctions: true }],
      "no-return-await": "error",
      "prefer-destructuring": "warn",
      "arrow-body-style": ["warn", "as-needed"],
      "vue/multi-word-component-names": "off",
      "vue/no-mutating-props": "error",
      "vue/no-useless-v-bind": "warn",
      "vue/component-name-in-template-casing": [
        "error",
        "PascalCase",
        { registeredComponentsOnly: true },
      ],
      "vue/prop-name-casing": ["error", "camelCase"],
      "vue/require-default-prop": "off",
      "vue/define-props-declaration": ["error", "type-based"],
      "vue/define-emits-declaration": ["error", "type-based"],
      "vue/block-order": [
        "error",
        {
          order: ["script", "template", "style"],
        },
      ],
      // "@typescript-eslint/no-unused-vars": [
      //   "error",
      //   {
      //     args: "after-used",
      //     argsIgnorePattern: "^_",
      //     caughtErrors: "all",
      //     caughtErrorsIgnorePattern: "^_",
      //     destructuredArrayIgnorePattern: "^_",
      //     varsIgnorePattern: "^_",
      //     ignoreRestSiblings: true,
      //   },
      // ],
      // "@typescript-eslint/explicit-function-return-type": [
      //   "warn",
      //   {
      //     allowExpressions: true,
      //     allowTypedFunctionExpressions: true,
      //     allowDirectConstAssertionInArrowFunctions: true,
      //   },
      // ],
      // "@typescript-eslint/consistent-type-imports": [
      //   "error",
      //   { prefer: "type-imports", disallowTypeAnnotations: false },
      // ],
      // "@typescript-eslint/naming-convention": [
      //   "error",
      //   {
      //     selector: "variable",
      //     format: ["camelCase", "UPPER_CASE"],
      //     leadingUnderscore: "allow",
      //   },
      //   {
      //     selector: "variable",
      //     types: ["boolean"],
      //     format: ["PascalCase"],
      //     prefix: ["is", "should", "has", "can", "did", "will", "was"],
      //   },
      //   {
      //     selector: "function",
      //     format: ["camelCase"],
      //   },
      //   {
      //     selector: "typeLike",
      //     format: ["PascalCase"],
      //   },
      //   {
      //     selector: "parameter",
      //     format: ["camelCase"],
      //     leadingUnderscore: "allow",
      //   },
      //   {
      //     selector: "interface",
      //     format: ["PascalCase"],
      //   },
      // ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  eslintConfigPrettier,
]);
