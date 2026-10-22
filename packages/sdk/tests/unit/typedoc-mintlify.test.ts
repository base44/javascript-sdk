import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Application, ReflectionKind } from "typedoc";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { nameCallableProperties } from "../../scripts/mintlify-post-processing/typedoc-plugin/typedoc-mintlify-content.js";
import {
  fixInPageAnchors,
  inlineStringUnions,
  nestUnderGroupTypes,
  parseStringUnion,
  propertiesAsFields,
  removeNonExposedTypeLinks,
  topLevelResponseFields,
} from "../../scripts/mintlify-post-processing/file-processing/file-processing.js";

// Runs TypeDoc with the Mintlify plugin on a small fixture, so each case is checked on the pages
// the plugin really writes.
const sdkDir = path.resolve(import.meta.dirname, "../..");
const fixtureDir = path.join(import.meta.dirname, "fixtures/typedoc-mintlify");
let out: string;

function page(name: string): string {
  return readFileSync(path.join(out, `${name}.mdx`), "utf8");
}

/** The text of one Returns section: from its heading to the next heading or member separator. */
function returnsOf(content: string, heading: string, after = ""): string {
  const start = content.indexOf(heading, after ? content.indexOf(after) : 0);
  expect(start, `${heading} after ${after || "the start"}`).toBeGreaterThanOrEqual(0);
  const rest = content.slice(start + heading.length);
  const end = rest.search(/^(#{1,6} |\*\*\*)/m);
  return end === -1 ? rest : rest.slice(0, end);
}

beforeAll(async () => {
  out = mkdtempSync(path.join(tmpdir(), "typedoc-mintlify-"));
  const app = await Application.bootstrapWithPlugins({
    entryPoints: [path.join(fixtureDir, "widgets.ts")],
    tsconfig: path.join(fixtureDir, "tsconfig.json"),
    plugin: [
      "typedoc-plugin-markdown",
      path.join(sdkDir, "scripts/mintlify-post-processing/typedoc-plugin/typedoc-mintlify-plugin.js"),
    ],
    out,
    fileExtension: ".mdx",
    readme: "none",
    hideBreadcrumbs: true,
    disableSources: true,
    hidePageTitle: true,
    sort: ["source-order"],
    entryFileName: "README.mdx",
    logLevel: "Error",
  });
  const project = await app.convert();
  if (!project) throw new Error("TypeDoc could not convert the fixture");
  await app.generateOutputs(project);
}, 60_000);

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe("Returns sections", () => {
  test("a method whose return expands into properties keeps its @returns text", () => {
    const returns = returnsOf(page("interfaces/Widgets"), "#### Returns", "### get()");

    expect(returns).toContain("Promise resolving to the widget.");
    expect(returns).toMatch(/<ResponseField name="id" type="string" required>\s+ID of the widget, such as `w_1`\./);
  });

  test("a plain return is its description, not a field named after a word in it", () => {
    const widgets = page("interfaces/Widgets");

    for (const [method, description] of [
      ["### save()", "Promise resolving once the values are sent."],
      ["### describe()", "Promise resolving to a string or an object."],
    ]) {
      const returns = returnsOf(widgets, "#### Returns", method);
      expect(returns).toContain(description);
      expect(returns).not.toContain("<ResponseField");
    }
  });

  test("a function's @returns text shows once, with single backticks", () => {
    const returns = returnsOf(page("functions/makeWidgets"), "## Returns");

    expect(returns.split("The widgets, with `get` and `save`.")).toHaveLength(2);
    expect(returns).not.toContain("``");
  });

  test("a function whose return expands into properties shows its @returns text once", () => {
    const returns = returnsOf(page("functions/makeWidget"), "## Returns");

    expect(returns.split("Promise resolving to the widget, with its `id`.")).toHaveLength(2);
    expect(returns).toContain('<ResponseField name="name"');
  });
});

describe("a property whose type is a function", () => {
  test("is headed as a property, with its own subsection nested under it", () => {
    const options = page("interfaces/WidgetOptions");

    expect(options).toMatch(/^### onWidget\?$/m);
    expect(options).not.toContain("onWidget()");
    expect(returnsOf(options, "##### Returns", "### onWidget?")).toContain("`void`");
    expect(options).toMatch(/^##### Parameters$/m);
  });

  test("documents its parameter", () => {
    const options = page("interfaces/WidgetOptions");

    expect(options).toMatch(/<ParamField body="widget" type="Widget" required>\s+The widget that was made\./);
  });
});

describe("nameCallableProperties", () => {
  const property = (name: string, callable: boolean) => ({
    name,
    kind: ReflectionKind.Property,
    type: callable ? { type: "reflection", declaration: { signatures: [{}] } } : { type: "intrinsic" },
  });

  test("renames only the members the reflection says are function-typed properties", () => {
    const model = {
      children: [property("onDone", true), property("label", false), { name: "run", kind: ReflectionKind.Method }],
    };
    const content = ["### onDone()?", "#### Parameters", "### run()", "#### Parameters", "### label"].join("\n");

    expect(nameCallableProperties(content, model).split("\n")).toEqual([
      "### onDone?",
      "##### Parameters",
      "### run()",
      "#### Parameters",
      "### label",
    ]);
  });

  test("ends the property's subsection at its next sibling, and skips code", () => {
    const model = { children: [property("onDone", true)] };
    const content = ["### onDone()", "```md", "#### not a heading", "```", "#### Returns", "### next", "#### Returns"].join("\n");

    expect(nameCallableProperties(content, model).split("\n")).toEqual([
      "### onDone",
      "```md",
      "#### not a heading",
      "```",
      "##### Returns",
      "### next",
      "#### Returns",
    ]);
  });

  test("leaves a page without such properties untouched", () => {
    expect(nameCallableProperties("### run()", undefined)).toBe("### run()");
    expect(nameCallableProperties("### run()", { children: [] })).toBe("### run()");
  });
});

describe("removeNonExposedTypeLinks", () => {
  const exposed = new Set(["Gone", "Kept"]);

  test("unlinks a type deleted after processing, whatever the link's text", () => {
    const content = "The [`connection`](Gone) and [a page](../interfaces/Gone#field).";

    expect(removeNonExposedTypeLinks(content, exposed, new Set(["Gone"]))).toEqual({
      content: "The `connection` and a page.",
      modified: true,
    });
  });

  test("keeps links to pages that stay, and external links", () => {
    const content = "See [Kept](Kept) and [Gone](https://example.com/Gone).";

    expect(removeNonExposedTypeLinks(content, exposed, new Set(["Gone"]))).toEqual({ content, modified: false });
    expect(removeNonExposedTypeLinks(content, exposed)).toEqual({ content, modified: false });
  });
});

describe("nestUnderGroupTypes", () => {
  test("nests a grouped type's methods under it, and drops the bare Methods label", () => {
    const section = [
      "### Question",
      "#### Properties",
      "## Methods",
      "",
      "### answer()",
      "#### Parameters",
      "### Entry",
      "#### Properties",
    ].join("\n");

    expect(nestUnderGroupTypes(section, new Set(["Question", "Entry"])).split("\n")).toEqual([
      "### Question",
      "#### Properties",
      "#### answer()",
      "##### Parameters",
      "### Entry",
      "#### Properties",
    ]);
  });
});

describe("propertiesAsFields", () => {
  test("turns a type's properties into fields and keeps its methods as headings", () => {
    const content = [
      "#### Properties",
      "",
      "#### kind",
      "",
      "> **kind**: `\"choice\"`",
      "",
      "Kind of question.",
      "",
      "***",
      "",
      "#### answer()",
      "",
      "Answers.",
    ].join("\n");

    const converted = propertiesAsFields(content, false);
    expect(converted).toContain(`<ResponseField name="kind" type="'choice'" required>`);
    expect(converted).not.toContain('name="answer()"');
    const method = converted.search(/^#### answer\(\)$/m);
    expect(method).toBeGreaterThan(converted.lastIndexOf("</ResponseField>"));
  });
});

describe("parseStringUnion", () => {
  test("reads the values and the comment after its summary paragraph", () => {
    const page = [
      "***",
      "",
      '> **Status** = `"ready"` | `"error"`',
      "",
      "What the widget is doing.",
      "",
      "- `ready`: Nothing is wrong.",
      "- `error`: The widget failed.",
    ].join("\n");

    expect(parseStringUnion(page, "Status")).toEqual({
      values: ["ready", "error"],
      details: "- `ready`: Nothing is wrong.\n- `error`: The widget failed.",
    });
  });

  test("skips other aliases, and unions that document each value as a field", () => {
    expect(parseStringUnion('> **Size** = `"s"` | `number`', "Size")).toBeNull();
    expect(parseStringUnion('Codes.\n\n<ResponseField name="bad_input">', "Code")).toBeNull();
  });
});

describe("inlineStringUnions", () => {
  test("adds the union's comment to each field that uses it, keeping the type's name", () => {
    const unions = new Map([["Status", { values: ["ready", "error"], details: "- `ready`: Fine.\n- `error`: Failed." }]]);
    const content = [
      '<ResponseField name="status" type="Status" required>',
      "",
      "What the widget is doing.",
      "",
      "</ResponseField>",
      "",
      '<ParamField body="other" type="Statuses">',
      "",
      "</ParamField>",
    ].join("\n");

    const { content: inlined, modified } = inlineStringUnions(content, unions);
    expect(modified).toBe(true);
    expect(inlined).toContain(
      '<ResponseField name="status" type="Status" required>\n\nWhat the widget is doing.\n\n- `ready`: Fine.\n- `error`: Failed.\n\n</ResponseField>'
    );
    expect(inlined).toContain('<ParamField body="other" type="Statuses">\n\n</ParamField>');
  });

  test("lists the values when the comment doesn't name them all", () => {
    const unions = new Map([["Unit", { values: ["day", "week", "month"], details: "" }]]);
    const content = '<ParamField body="unit" type="Unit" required>\n\nBilling unit.\n\n</ParamField>';

    expect(inlineStringUnions(content, unions).content).toBe(
      "<ParamField body=\"unit\" type=\"Unit\" required>\n\nBilling unit.\n\nIt's `'day'`, `'week'`, or `'month'`.\n\n</ParamField>"
    );
  });
});

describe("topLevelResponseFields", () => {
  test("returns each outermost field with its nested fields inside", () => {
    const content = [
      '<Accordion title="Properties">',
      '<ResponseField name="items" type="Item[]" required>',
      "The items.",
      '<Accordion title="Properties">',
      '<ResponseField name="id" type="string" required>',
      "ID.",
      "</ResponseField>",
      "</Accordion>",
      "</ResponseField>",
      '<ResponseField name="status" type="&quot;ready&quot; | &quot;error&quot;" required>',
      "Status.",
      "</ResponseField>",
      "</Accordion>",
    ].join("\n");

    const fields = topLevelResponseFields(content);
    expect(fields.map(({ name, type }) => [name, type])).toEqual([
      ["items", "Item[]"],
      ["status", "&quot;ready&quot; | &quot;error&quot;"],
    ]);
    expect(fields[0].inner).toContain('<ResponseField name="id" type="string" required>');
  });
});

describe("fixInPageAnchors", () => {
  test("keeps links to headings and explicit anchors", () => {
    const content = ["## Send", "<a id=\"list-records\" />", "See [send](#send) and [records](#list-records)."].join("\n");

    expect(fixInPageAnchors(content)).toBe(content);
  });

  test("follows a type's section to its new heading", () => {
    const content = ["## Entity Handler Methods", "See [EntityHandler](#entityhandler)."].join("\n");

    expect(fixInPageAnchors(content)).toContain("[EntityHandler](#entity-handler-methods)");
  });

  test("unlinks an anchor the page doesn't have, and leaves other links alone", () => {
    const content = "The [status](#status) and the [guide](/guide#status).";

    expect(fixInPageAnchors(content)).toBe("The status and the [guide](/guide#status).");
  });

  test("matches Mintlify's anchors for headings with dots and underscores", () => {
    const content = ["### `pull_request.changed`", "See [the event](#pull_request-changed)."].join("\n");

    expect(fixInPageAnchors(content)).toBe(content);
  });

  test("links to a field only when one field on the page has that name", () => {
    const content = [
      '<ResponseField name="error" type="ChatError">',
      '<ResponseField name="status" type="ChatStatus">',
      '<ResponseField name="status" type="string">',
      "See [error](#error) and [status](#status).",
    ].join("\n");

    expect(fixInPageAnchors(content)).toContain("See [error](#param-error) and status.");
  });
});
