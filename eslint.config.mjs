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
  {
    // Contract Boundary: die Vertraege sind I/O-frei und muessen ohne
    // Serverlaufzeit portierbar bleiben (REQ-A-001).
    files: ["src/contracts/**/*.ts"],
    ignores: ["src/contracts/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/server/**",
                "*/server",
                "next",
                "next/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
              ],
              message: "src/contracts darf nicht von der Serverschicht abhaengen.",
            },
          ],
        },
      ],
    },
  },
  {
    // Die Domaene ist I/O-frei.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/server/**",
                "*/server",
                "**/app/**",
                "next",
                "next/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
              ],
              message: "src/domain muss I/O-frei bleiben.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
