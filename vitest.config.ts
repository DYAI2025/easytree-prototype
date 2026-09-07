import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "domain",
          environment: "node",
          include: [
            "src/domain/**/*.test.ts",
            "src/server/**/*.test.ts",
            "src/contracts/**/*.test.ts",
            "src/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/ui/**/*.test.tsx", "src/app/**/*.test.tsx"],
          setupFiles: ["vitest.setup.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          // Alle Integrationstests teilen EINE Datenbank; parallele Dateien
          // wuerden sich gegenseitig die Fixtures truncaten.
          fileParallelism: false,
        },
      },
    ],
  },
});
