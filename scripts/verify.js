import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const requiredFiles = [
  "index.html",
  "styles.css",
  "src/app.js",
  "src/model.js",
  "README.md",
  "LICENSE",
  "tests/model.test.js",
  "tests/app-contract.test.js",
];
const requiredTools = [
  "get_scenario_state",
  "preview_allocation",
  "evaluate_tradeoffs",
  "find_feasible_compromise",
  "price_of_protecting",
];

for (const file of requiredFiles) await access(resolve(file));
const source = await readFile(resolve("src/app.js"), "utf8");

// Read the real registration table rather than substring-matching the whole
// file: a tool name mentioned in a comment or a catalog string is not a
// registered tool, and an "at least these names" check would not catch an
// extra capability being added.
const tableStart = source.indexOf("const WEBMCP_TOOLS = [");
const table = source.slice(tableStart, source.indexOf("\n];", tableStart) + 3);
if (!table) throw new Error("Could not locate the WEBMCP_TOOLS registration table.");
const registered = [...table.matchAll(/^\s{4}name: "([a-z_]+)",$/gm)].map(([, name]) => name);

if (registered.length !== requiredTools.length) {
  throw new Error(
    `Expected exactly ${requiredTools.length} registered WebMCP tools, found ${registered.length}: ${registered.join(", ")}`,
  );
}
for (const tool of requiredTools) {
  if (!registered.includes(tool)) throw new Error(`Missing WebMCP tool registration: ${tool}`);
}
const blocks = table.split(/^  \{$/m).filter((block) => block.includes('name: "'));
for (const block of blocks) {
  const name = block.match(/name: "([a-z_]+)"/)?.[1] ?? "unknown";
  if (!/readOnlyHint: true/.test(block)) throw new Error(`${name} is not marked read-only.`);
}
for (const forbidden of ["applyCompromise", "applyProtection", "resetScenario", "setAllocation", "readOnlyHint: false"]) {
  if (table.includes(forbidden)) throw new Error(`Registered table exposes forbidden mutation reach: ${forbidden}`);
}
if (!source.includes("document.modelContext.registerTool")) {
  throw new Error("Missing imperative WebMCP registration.");
}
console.log(
  `Verified ${requiredFiles.length} source files and exactly ${registered.length} read-only WebMCP tools: ${registered.join(", ")}.`,
);
