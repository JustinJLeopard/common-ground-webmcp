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
];

for (const file of requiredFiles) await access(resolve(file));
const source = await readFile(resolve("src/app.js"), "utf8");
for (const tool of requiredTools) {
  if (!source.includes(tool)) throw new Error(`Missing WebMCP tool registration: ${tool}`);
}
if (!source.includes("document.modelContext.registerTool")) {
  throw new Error("Missing imperative WebMCP registration.");
}
console.log(`Verified ${requiredFiles.length} source files and ${requiredTools.length} WebMCP tools.`);
