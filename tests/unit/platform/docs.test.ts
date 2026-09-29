import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
test("every public export and interface field is documented", () => {
  const entry = path.join(root, "platform-src/server/index.ts");
  const program = ts.createProgram([entry], { target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry)!;
  const docs = readFileSync(path.join(root, "platform-docs/api.md"), "utf8") + readFileSync(path.join(root, "platform-docs/tokens.md"), "utf8");
  for (const exported of checker.getExportsOfModule(checker.getSymbolAtLocation(source)!)) {
    assert.ok(docs.includes(exported.name), `Missing reference for ${exported.name}`);
    const symbol = checker.getAliasedSymbol(exported);
    assert.ok(symbol.getDocumentationComment(checker).length, `Missing JSDoc for ${exported.name}`);
    for (const decl of symbol.declarations ?? []) {
      if (ts.isInterfaceDeclaration(decl)) for (const member of decl.members) {
        const name = member.name?.getText();
        if (!name) continue;
        const property = checker.getSymbolAtLocation(member.name!);
        assert.ok(property?.getDocumentationComment(checker).length, `Missing field JSDoc: ${exported.name}.${name}`);
        assert.ok(docs.includes(`\`${name}\``) || docs.includes(`${name}(`), `Missing reference field: ${exported.name}.${name}`);
      }
    }
  }
});
