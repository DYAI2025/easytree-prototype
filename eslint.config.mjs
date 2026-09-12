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
  {
    // Browser-Speicher-Grenze (REQ-NF-001, TASK-050 Guard 1): fachlicher
    // Zustand liegt auf dem Server. Ansichtszustand steht in der URL,
    // Formularzustand in der React-Instanz des Drawers.
    //
    // no-restricted-imports kann diese Grenze nicht ausdruecken - localStorage
    // ist kein Modul, sondern ein Global. Beide Zugriffswege sind erfasst: der
    // blosse Bezeichner und der Umweg ueber window.
    files: ["src/ui/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message: "Fachlicher Zustand gehoert auf den Server (REQ-NF-001).",
        },
        {
          name: "sessionStorage",
          message: "Fachlicher Zustand gehoert auf den Server (REQ-NF-001).",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "localStorage",
          message: "Fachlicher Zustand gehoert auf den Server (REQ-NF-001).",
        },
        {
          object: "window",
          property: "sessionStorage",
          message: "Fachlicher Zustand gehoert auf den Server (REQ-NF-001).",
        },
      ],
    },
  },
];

export default eslintConfig;
