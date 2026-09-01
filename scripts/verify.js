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
];
const requiredTools = [
  "get_scenario_state",
  "set_allocation",
  "evaluate_tradeoffs",
  "find_feasible_compromise",
  "apply_compromise",
  "reset_scenario",
  "price_of_protecting",
];

for (const file of requiredFiles) await access(resolve(file));
const source = await readFile(resolve("src/app.js"), "utf8");

// Read the real registration table rather than substring-matching the whole
// file: a tool name mentioned in a comment or a catalog string is not a
// registered tool, and "at least the six I expected" would not have caught a
// seventh being dropped.
const table = source.slice(
  source.indexOf("const WEBMCP_TOOLS = ["),
  source.indexOf("function wireHumanControls"),
);
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
if (!source.includes("document.modelContext.registerTool")) {
  throw new Error("Missing imperative WebMCP registration.");
}
console.log(
  `Verified ${requiredFiles.length} source files and exactly ${registered.length} registered WebMCP tools: ${registered.join(", ")}.`,
);
