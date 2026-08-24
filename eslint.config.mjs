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
    // Daemon dell'EXE: CJS volutamente (runtime pkg, require() necessario).
    "scripts/ascend-daemon.cjs",
    // Artefatti di build EXE (app statica copiata + binario).
    "dist/**",
    "pkgbuild/**",
  ]),
]);

export default eslintConfig;
