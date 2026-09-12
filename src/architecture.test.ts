import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * TASK-050: die Invarianten des Plans maschinell absichern (REQ-A-001,
 * REQ-NF-001, REQ-S-001).
 *
 * Diese Guards pruefen ARCHITEKTUR, nicht Zeichenketten. Jede Datei wird mit
 * dem TypeScript-Parser gelesen, der schon als devDependency im Repo liegt -
 * damit zaehlen echte Import-Spezifizierer, echte Bezeichner und echte
 * Aufrufausdruecke. Ein `localStorage` im Kommentar oder ein `fetch(` in einer
 * Zeichenkette erzeugt so keinen Fehlalarm, und umgekehrt entkommt kein
 * Verstoss durch abweichende Schreibweise oder Zeilenumbruch.
 *
 * Die Dateimenge wird IMMER aus dem Dateisystem abgeleitet, nie gepflegt.
 * Deshalb traegt jeder Guard zusaetzlich eine Untergrenze und eine
 * Ankerdatei: eine leer gelaufene Menge ist sonst still gruen, und genau das
 * waere ein Guard, der nichts mehr bewacht.
 */

const REPO_ROOT = process.cwd();
const SRC_DIR = "src";

/** Verzeichnisse, die nie Produktionsquelle dieses Repos sind. */
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "coverage", "dist", "build"]);

const TEST_FILE = /\.test\.tsx?$/;

/** Rekursive Dateisuche ohne zusaetzliche Abhaengigkeit, Ergebnis repo-relativ. */
function collectSourceFiles(relativeDir: string): readonly string[] {
  const entries = readdirSync(path.join(REPO_ROOT, relativeDir), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;

    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        files.push(...collectSourceFiles(relativePath));
      }

      continue;
    }

    if (/\.tsx?$/.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

const ALL_SOURCE_FILES = collectSourceFiles(SRC_DIR);

/**
 * Produktionsquelle = alles unter src/ ausser den Testdateien selbst. Tests
 * duerfen Fixtures bauen (fremde Hosts, Speicher-Attrappen); die Guards regeln
 * den ausgelieferten Code.
 */
const PRODUCTION_FILES = ALL_SOURCE_FILES.filter((file) => !TEST_FILE.test(file));

const parsed = new Map<string, ts.SourceFile>();

function parse(relativePath: string): ts.SourceFile {
  const cached = parsed.get(relativePath);

  if (cached !== undefined) {
    return cached;
  }

  const text = readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
  const sourceFile = ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  parsed.set(relativePath, sourceFile);

  return sourceFile;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function inDirectory(file: string, directory: string): boolean {
  return file.startsWith(`${directory}/`);
}

function anchor(files: readonly string[], expected: string): void {
  expect(files, `Ankerdatei ${expected} fehlt in der geprueften Menge`).toContain(expected);
}

/* ------------------------------------------------------------------ *
 * Modulspezifizierer
 * ------------------------------------------------------------------ */

interface ModuleReference {
  readonly specifier: string;
  readonly line: number;
}

/**
 * Alle Modulbezuege einer Datei: statischer Import, `export … from`,
 * `import … = require(…)`, dynamisches `import(…)` und `require(…)`.
 */
function moduleReferences(sourceFile: ts.SourceFile): readonly ModuleReference[] {
  const references: ModuleReference[] = [];

  const record = (node: ts.Node, specifierNode: ts.Node | undefined): void => {
    if (specifierNode !== undefined && ts.isStringLiteralLike(specifierNode)) {
      references.push({ specifier: specifierNode.text, line: lineOf(sourceFile, node) });
    }
  };

  walk(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(node, node.moduleSpecifier);

      return;
    }

    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      record(node, node.moduleReference.expression);

      return;
    }

    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";

      if (isDynamicImport || isRequire) {
        record(node, node.arguments[0]);
      }
    }
  });

  return references;
}

/**
 * Loest relative Spezifizierer und den tsconfig-Alias `@/*` zu einem
 * repo-relativen Pfad auf. Bare-Spezifizierer (`next`, `postgres`, …) geben
 * null zurueck - fuer sie gilt die Namensliste.
 */
function resolveToRepoPath(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) {
    return `${SRC_DIR}/${specifier.slice(2)}`;
  }

  if (!specifier.startsWith(".")) {
    return null;
  }

  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
}

interface BoundaryRule {
  /** Repo-relative Verzeichnisse, die nicht importiert werden duerfen. */
  readonly forbiddenDirectories: readonly string[];
  /** Bare-Module, die nicht importiert werden duerfen (exakt oder als Praefix `name/`). */
  readonly forbiddenPackages: readonly string[];
}

function boundaryViolations(files: readonly string[], rule: BoundaryRule): readonly string[] {
  const violations: string[] = [];

  for (const file of files) {
    for (const reference of moduleReferences(parse(file))) {
      const resolved = resolveToRepoPath(file, reference.specifier);

      if (resolved !== null) {
        const forbidden = rule.forbiddenDirectories.find(
          (directory) => resolved === directory || inDirectory(resolved, directory),
        );

        if (forbidden !== undefined) {
          violations.push(
            `${file}:${reference.line} importiert ${reference.specifier} (${forbidden})`,
          );
        }

        continue;
      }

      const forbiddenPackage = rule.forbiddenPackages.find(
        (name) => reference.specifier === name || reference.specifier.startsWith(`${name}/`),
      );

      if (forbiddenPackage !== undefined) {
        violations.push(`${file}:${reference.line} importiert ${reference.specifier}`);
      }
    }
  }

  return violations;
}

/* ------------------------------------------------------------------ *
 * Guard 1 - Browser-Speicher (REQ-NF-001)
 * ------------------------------------------------------------------ */

describe("Guard 1: kein Browser-Speicher in src/ui und src/app", () => {
  const FORBIDDEN_STORAGE = new Set(["localStorage", "sessionStorage"]);

  const files = PRODUCTION_FILES.filter(
    (file) => inDirectory(file, `${SRC_DIR}/ui`) || inDirectory(file, `${SRC_DIR}/app`),
  );

  it("prueft eine nicht leere Menge echter Produktionsdateien", () => {
    expect(files.length).toBeGreaterThanOrEqual(40);
    anchor(files, "src/ui/calendar/day-card.tsx");
    anchor(files, "src/app/planung/page.tsx");
  });

  it("fachlicher Zustand liegt auf dem Server, nicht im Browser-Speicher", () => {
    const violations: string[] = [];

    for (const file of files) {
      const sourceFile = parse(file);

      walk(sourceFile, (node) => {
        // Nur Bezeichner: ein `localStorage` im Kommentar oder in einer
        // Zeichenkette ist kein Zugriff und wird nicht gemeldet.
        if (ts.isIdentifier(node) && FORBIDDEN_STORAGE.has(node.text)) {
          violations.push(`${file}:${lineOf(sourceFile, node)} verwendet ${node.text}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Guard 2 - Domaenengrenze (REQ-A-001)
 * ------------------------------------------------------------------ */

describe("Guard 2: src/domain bleibt I/O-frei", () => {
  const files = PRODUCTION_FILES.filter((file) => inDirectory(file, `${SRC_DIR}/domain`));

  it("prueft eine nicht leere Menge echter Produktionsdateien", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    anchor(files, "src/domain/local-date.ts");
    anchor(files, "src/domain/cost-calculation.ts");
  });

  it("importiert weder Server, App noch Laufzeitbibliotheken", () => {
    expect(
      boundaryViolations(files, {
        forbiddenDirectories: [`${SRC_DIR}/server`, `${SRC_DIR}/app`],
        forbiddenPackages: ["next", "drizzle-orm", "postgres"],
      }),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Guard 3 - Vertragsgrenze (REQ-A-001)
 * ------------------------------------------------------------------ */

describe("Guard 3: src/contracts bleibt ohne Serverlaufzeit portierbar", () => {
  const files = PRODUCTION_FILES.filter((file) => inDirectory(file, `${SRC_DIR}/contracts`));

  it("prueft eine nicht leere Menge echter Produktionsdateien", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    anchor(files, "src/contracts/common.ts");
    anchor(files, "src/contracts/engagement.ts");
  });

  /*
   * TASK-050 verlangt als Minimum nur die Serverschicht. Die ESLint-Regel im
   * Repo ist seit TASK-022 strenger (zusaetzlich next/drizzle/postgres), und
   * ein Guard darf bestehenden Schutz nicht absenken - deshalb hier dieselbe
   * Menge wie in eslint.config.mjs.
   */
  it("importiert weder Server noch Serverlaufzeitbibliotheken", () => {
    expect(
      boundaryViolations(files, {
        forbiddenDirectories: [`${SRC_DIR}/server`],
        forbiddenPackages: ["next", "drizzle-orm", "postgres"],
      }),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Guard 4 - Ausgehende Netzwerkgrenze (REQ-S-001)
 * ------------------------------------------------------------------ */

const GEOCODING_DIR = `${SRC_DIR}/server/geocoding`;

interface FetchCall {
  readonly call: ts.CallExpression;
  /** true nur bei `fetch(…)` bzw. `x.fetch(…)`, nicht bei Aliassen. */
  readonly exact: boolean;
}

/**
 * Jeder Aufruf, dessen Aufgerufenes "fetch" im Namen traegt.
 *
 * Bewusst breiter als der blosse Bezeichner `fetch`: der Nominatim-Adapter
 * ruft ueber das injizierte `options.fetchImpl` auf (gemessen am 12.09.2026 an
 * src/server/geocoding/nominatim.adapter.ts). Ein Guard, der nur `fetch(`
 * kennt, saehe genau den einen echten Aussenaufruf dieses Repos nicht - und
 * ebenso wenig eine Umgehung ueber `doFetch`/`customFetch`. Falsch-positive
 * Treffer sind unschaedlich: gemeldet wird erst eine absolute Fremd-URL im
 * Ziel, und die waere in jedem Fall ein Verstoss.
 */
function fetchCalls(sourceFile: ts.SourceFile): readonly FetchCall[] {
  const calls: FetchCall[] = [];

  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) {
      return;
    }

    const callee = node.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : undefined;

    if (name === undefined || !/fetch/i.test(name)) {
      return;
    }

    calls.push({ call: node, exact: name === "fetch" });
  });

  return calls;
}

/** Alle Zeichenkettenteile eines Ausdrucks, inklusive Template-Segmenten. */
function literalParts(node: ts.Node): readonly string[] {
  const parts: string[] = [];

  walk(node, (child) => {
    if (ts.isStringLiteralLike(child)) {
      parts.push(child.text);

      return;
    }

    if (
      child.kind === ts.SyntaxKind.TemplateHead ||
      child.kind === ts.SyntaxKind.TemplateMiddle ||
      child.kind === ts.SyntaxKind.TemplateTail
    ) {
      parts.push((child as ts.TemplateLiteralLikeNode).text);
    }
  });

  return parts;
}

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;
const PROTOCOL_RELATIVE = /^\/\/[^/]/;

describe("Guard 4: ausgehende Aufrufe nur aus src/server/geocoding", () => {
  const files = PRODUCTION_FILES.filter((file) => !inDirectory(file, GEOCODING_DIR));

  it("prueft eine nicht leere Menge echter Produktionsdateien", () => {
    expect(files.length).toBeGreaterThanOrEqual(80);
    anchor(files, "src/lib/api-client.ts");
    expect(files).not.toContain("src/server/geocoding/nominatim.adapter.ts");
  });

  it("kein fetch gegen einen fremden Host ausserhalb des Geocoders", () => {
    const violations: string[] = [];

    for (const file of files) {
      const sourceFile = parse(file);

      for (const { call, exact } of fetchCalls(sourceFile)) {
        const target = call.arguments[0];
        const position = `${file}:${lineOf(sourceFile, call)}`;

        if (target === undefined) {
          continue;
        }

        for (const part of literalParts(target)) {
          if (ABSOLUTE_URL.test(part) || PROTOCOL_RELATIVE.test(part)) {
            violations.push(`${position} ruft ${part} auf`);
          }
        }

        // Ein direkt notiertes Ziel muss ein eigener Pfad sein. Variablen
        // bleiben erlaubt: der typisierte Client reicht `/api/...` durch.
        // Nur beim echten `fetch`: ein beliebiger Name mit "fetch" darin kann
        // ein Routenkuerzel statt einer URL entgegennehmen.
        if (exact && ts.isStringLiteralLike(target) && !target.text.startsWith("/")) {
          violations.push(`${position} ruft das relative Ziel "${target.text}" auf`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  /*
   * Ohne diese Zusicherung waere die Ausnahme fuer den Geocoder Dekoration:
   * ein Guard, der einen Ordner freistellt, in dem gar nichts passiert,
   * beweist nichts ueber die Lage der Netzwerkgrenze.
   */
  it("der ausgenommene Geocoder traegt den tatsaechlichen Aussenaufruf", () => {
    const geocodingFiles = PRODUCTION_FILES.filter((file) => inDirectory(file, GEOCODING_DIR));

    expect(geocodingFiles.length).toBeGreaterThanOrEqual(4);

    const withFetch = geocodingFiles.filter((file) => fetchCalls(parse(file)).length > 0);

    expect(withFetch).toContain("src/server/geocoding/nominatim.adapter.ts");

    // Und die absolute Fremd-URL, die ueberall sonst ein Verstoss waere, liegt
    // ebenfalls hier - sonst bewachte Guard 4 eine leere Grenze.
    const withAbsoluteUrl = geocodingFiles.filter((file) =>
      literalParts(parse(file)).some((part) => ABSOLUTE_URL.test(part)),
    );

    expect(withAbsoluteUrl.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ *
 * Guard 5 - Jede Route durch defineRoute (REQ-A-001, REQ-S-001)
 * ------------------------------------------------------------------ */

const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

function isExported(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

describe("Guard 5: jede Route-Datei geht durch defineRoute", () => {
  const files = PRODUCTION_FILES.filter(
    (file) => inDirectory(file, `${SRC_DIR}/app/api`) && file.endsWith("/route.ts"),
  );

  it("prueft eine nicht leere Menge echter Routendateien", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
    anchor(files, "src/app/api/health/route.ts");
    anchor(files, "src/app/api/einsaetze/route.ts");
  });

  it("jede exportierte HTTP-Methode ist ein defineRoute-Aufruf", () => {
    const violations: string[] = [];

    for (const file of files) {
      const sourceFile = parse(file);
      const exportedMethods: string[] = [];

      for (const statement of sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement)) {
          const name = statement.name?.text;

          if (name !== undefined && HTTP_METHODS.has(name) && isExported(statement)) {
            exportedMethods.push(name);
            violations.push(
              `${file}:${lineOf(sourceFile, statement)} exportiert ${name} als Funktion statt als defineRoute-Aufruf`,
            );
          }

          continue;
        }

        if (!ts.isVariableStatement(statement)) {
          continue;
        }

        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !HTTP_METHODS.has(declaration.name.text)) {
            continue;
          }

          if (!isExported(declaration)) {
            continue;
          }

          const name = declaration.name.text;

          exportedMethods.push(name);

          const initializer = declaration.initializer;
          const wrapped =
            initializer !== undefined &&
            ts.isCallExpression(initializer) &&
            ts.isIdentifier(initializer.expression) &&
            initializer.expression.text === "defineRoute";

          if (!wrapped) {
            violations.push(
              `${file}:${lineOf(sourceFile, declaration)} exportiert ${name} ohne defineRoute`,
            );
          }
        }
      }

      if (exportedMethods.length === 0) {
        violations.push(`${file} exportiert ueberhaupt keine HTTP-Methode`);
      }

      const importsDefineRoute = moduleReferences(sourceFile).some((reference) => {
        const resolved = resolveToRepoPath(file, reference.specifier);

        return resolved === `${SRC_DIR}/server/http/handler`;
      });

      if (!importsDefineRoute) {
        violations.push(`${file} importiert defineRoute nicht aus src/server/http/handler`);
      }
    }

    expect(violations).toEqual([]);
  });
});
