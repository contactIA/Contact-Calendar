import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// O código antigo, que sai fase a fase (docs/migracao-para-a-arquitetura-do-crm.md).
// Os erros que ele já tinha viram aviso, para o CI valer desde já; o código novo
// segue as regras inteiras.
const LEGADO = [
  "src/app/\\[accountId\\]/**",
  "src/app/onboarding/**",
  "src/app/api/{admin,agent,appointments,auth,dentists,helena,onboarding,patients,procedures,schedule-blocks,slots,units}/**",
  "src/components/**",
  "src/hooks/**",
  "src/lib/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { segredo: _, ...publico } = x` tira um campo da resposta de propósito.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: LEGADO,
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/use-memo": "warn",
      "prefer-const": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "graphify-out/**",
  ]),
]);

export default eslintConfig;
