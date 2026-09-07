// eslint-config-next@16.3.4 exportiert bereits fertige Flat-Config-Arrays
// (`Linter.Config[]`). `FlatCompat` aus @eslint/eslintrc ist dafür der falsche
// Adapter und bricht unter ESLint 10 mit "Converting circular structure to JSON".
// Deshalb werden die Configs direkt gespreizt.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [".next/**", "out/**", "build/**", "coverage/**", "drizzle/**", "next-env.d.ts"],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default eslintConfig;
