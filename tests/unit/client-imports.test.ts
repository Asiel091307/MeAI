import { readdir, readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import ts from 'typescript';

// Client components run in the browser. A value import that reaches a server-only module
// (route handlers, the database layer, `pg`) makes Next.js try to bundle `pg` for the browser,
// which fails on `fs` and breaks every page with HTTP 500. Type-only imports are erased and safe.
const SERVER_ONLY = [/-handler$/, /\/src\/db\/(?!contracts$)/, /^pg$/, /\/src\/documents\//];

async function clientFiles(): Promise<string[]> {
  // Every .ts/.tsx under components/, including subfolders (library/, conversation/, evidence/, hooks/).
  const entries = await readdir(new URL('../../components/', import.meta.url), { recursive: true });
  const components = entries
    .map((name) => String(name).replaceAll('\\', '/'))
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => `components/${name}`);
  return ['app/page.tsx', ...components];
}

test('the guard scans the nested component folders too', async () => {
  const files = await clientFiles();
  expect(files).toContain('components/app-shell.tsx');
  expect(files).toContain('components/conversation/message-item.tsx');
  expect(files).toContain('components/hooks/use-chat.ts');
});

function valueImports(source: string): string[] {
  const file = ts.createSourceFile('client.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const specifiers: string[] = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    const onlyTypes =
      !statement.importClause?.name &&
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((element) => element.isTypeOnly);
    if (!onlyTypes) specifiers.push((statement.moduleSpecifier as ts.StringLiteral).text);
  }
  return specifiers;
}

test('client components never import server-only modules as values', async () => {
  const offenders: string[] = [];
  for (const path of await clientFiles()) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    if (!/^['"]use client['"]/m.test(source)) continue;
    for (const specifier of valueImports(source)) {
      if (SERVER_ONLY.some((pattern) => pattern.test(specifier))) {
        offenders.push(`${path} -> ${specifier}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
