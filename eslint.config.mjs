import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Capacitor native shells + toolchain (generated/build outputs, including
    // the web bundle `cap sync` copies under ios/App/App/public):
    "android/**",
    "ios/**",
    ".toolchain/**",
  ]),
]);

export default eslintConfig;
