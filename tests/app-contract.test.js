import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { INITIAL_ALLOCATIONS } from "../src/model.js";

class FakeClassList {
  add() {}
  remove() {}
  toggle() {}
}

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.children = [];
    this.classList = new FakeClassList();
    this.className = "";
    this.disabled = false;
    this.hidden = false;
    this.innerHTML = "";
    this.offsetWidth = 0;
    this.parentElement = {
      classList: new FakeClassList(),
      setAttribute() {},
    };
    this.style = {};
    this.textContent = "";
    this.value = "";
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

let instance = 0;

async function loadApp() {
  const elements = new Map();
  const elementFor = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new FakeElement());
    return elements.get(selector);
  };
  elementFor("#total-value").textContent = "—";
  elementFor("#protect-target").value = "care-link-rides";
  elementFor("#protect-minimum").value = "225000";

  const tools = new Map();
  globalThis.document = {
    addEventListener() {},
    createElement() { return new FakeElement(); },
    modelContext: {
      async registerTool(tool) {
        assert.equal(tools.has(tool.name), false, `duplicate tool ${tool.name}`);
        tools.set(tool.name, tool);
      },
    },
    querySelector(selector) { return elementFor(selector); },
  };

  const appUrl = new URL("../src/app.js", import.meta.url);
  const app = await import(`${pathToFileURL(appUrl.pathname).href}?contract=${instance += 1}`);
  for (let attempt = 0; attempt < 20 && tools.size < 5; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(tools.size, 5, "the live registration loop did not expose five tools");
  return { app, elementFor, tools };
}

const allocationBytes = (snapshot) => JSON.stringify(snapshot.allocations);

test("the registered-handler and human-commitment contract", async (t) => {
  await t.test("the opening has one find action and one adjacent compromise commit", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    assert.equal((html.match(/data-action="find"/g) ?? []).length, 1);
    assert.equal((html.match(/data-action="apply"/g) ?? []).length, 1);
    const findAt = html.indexOf('data-action="find"');
    const handoffAt = html.indexOf('class="panel compromise-panel opening-handoff"');
    const applyAt = html.indexOf('data-action="apply"');
    assert.ok(findAt < handoffAt && handoffAt < applyAt);
    assert.match(html.slice(handoffAt, applyAt), /revision stays put/);
  });

  await t.test("the allocation table keeps one four-column decision truth", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
    const table = html.slice(html.indexOf("<table>"), html.indexOf("</table>") + 8);

    assert.equal((table.match(/<th scope="col">/g) ?? []).length, 4);
    assert.doesNotMatch(table, /Agent compromise/);
    assert.doesNotMatch(appSource, /proposal\.agentTarget/);
    assert.match(html, /class="table-scroll" tabindex="0"/);
  });

  await t.test("the narrow header wraps without masking document overflow", async () => {
    const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /overflow-x\s*:\s*hidden/);
    const mobile = css.slice(css.indexOf("@media (max-width: 620px)"));
    assert.match(mobile, /\.site-header\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(mobile, /\.status-chip\s*\{[^}]*max-width:\s*100%/);
    assert.match(mobile, /overflow-wrap:\s*anywhere/);
    assert.match(mobile, /@media \(max-width: 420px\)[\s\S]*\.header-meta\s*\{\s*width:\s*100%/);
  });

  await t.test("all five actual registered executors are advisory under one tool-only sequence", async () => {
    const { app, elementFor, tools } = await loadApp();
    assert.deepEqual([...tools.keys()], [
      "get_scenario_state",
      "preview_allocation",
      "evaluate_tradeoffs",
      "find_feasible_compromise",
      "price_of_protecting",
    ]);
    for (const tool of tools.values()) {
      assert.equal(tool.annotations.readOnlyHint, true, `${tool.name} is not read-only`);
      assert.doesNotMatch(
        tool.execute.toString(),
        /applyCompromise|applyProtection|resetScenario|setAllocation/,
        `${tool.name} reaches a human mutation function`,
      );
    }

    const before = app.getAppSnapshot();
    const calls = [
      ["get_scenario_state", {}],
      ["preview_allocation", { proposalId: "care-link-rides", amount: 100_000 }],
      ["evaluate_tradeoffs", { focus: "stakeholders" }],
      ["find_feasible_compromise", {}],
      ["price_of_protecting", { proposalId: "care-link-rides", atLeast: 225_000 }],
    ];
    for (const [name, args] of calls) {
      await tools.get(name).execute(args);
      if (name === "find_feasible_compromise") {
        assert.match(elementFor("#decision-body").textContent, /Human action is required/);
        assert.match(elementFor("#decision-revision").textContent, /revision 0 unchanged/);
      }
    }

    const after = app.getAppSnapshot();
    assert.equal(after.revision, 0);
    assert.equal(allocationBytes(after), allocationBytes(before));
    assert.match(elementFor("#decision-body").textContent, /Pending human review|Human action is required/);
    assert.match(elementFor("#decision-revision").textContent, /revision 0 unchanged/);
    assert.equal(elementFor('[data-action="apply"]').disabled, false);
    assert.equal(elementFor('[data-action="apply-protection"]').disabled, false);
  });

  await t.test("Human Find then Apply advances exactly once and protects every floor", async () => {
    const { app, elementFor } = await loadApp();
    const found = app.findCompromise("Human");
    assert.equal(found.ok, true);
    assert.equal(app.getAppSnapshot().revision, 0);
    assert.match(elementFor("#decision-body").textContent, /Human action is required/);

    const applied = app.applyCompromise();
    assert.equal(applied.ok, true);
    assert.equal(app.getAppSnapshot().revision, 1);
    assert.equal(applied.evaluation.constraintsMet, 3);
    assert.equal(applied.evaluation.constraintsTotal, 3);
    assert.match(elementFor("#decision-body").textContent, /Human accepted/);
    assert.match(elementFor("#activity-log").innerHTML, /Human · Applied the shared compromise/);
  });

  await t.test("tool-controlled activity text stays text at the HTML boundary", async () => {
    const { app, elementFor, tools } = await loadApp();
    const before = app.getAppSnapshot();
    const payload = '<img src=x onerror="globalThis.compromised=true"> & \'quoted\'';
    // Call the actual handler without relying on the browser to validate its
    // schema: alternate clients and future fields must not create HTML sinks.
    await tools.get("evaluate_tradeoffs").execute({ focus: payload });
    const activityHtml = elementFor("#activity-log").innerHTML;
    assert.doesNotMatch(activityHtml, /<img/);
    assert.match(activityHtml, /&lt;img/);
    assert.match(activityHtml, /&amp;/);
    assert.deepEqual(app.getAppSnapshot(), before);
  });

  await t.test("Human prices and applies the known Care Link swap", async () => {
    const { app, elementFor } = await loadApp();
    const priced = app.askPriceOfProtecting("care-link-rides", 225_000, "Human");
    assert.equal(priced.ok, true);
    assert.equal(app.getAppSnapshot().revision, 0);

    const applied = app.applyProtection();
    const snapshot = app.getAppSnapshot();
    assert.equal(applied.ok, true);
    assert.equal(snapshot.revision, 1);
    assert.deepEqual(snapshot.allocations, priced.allocations);
    assert.equal(snapshot.allocations["care-link-rides"], 225_000);
    assert.match(elementFor("#decision-body").textContent, /Human accepted/);
    assert.match(elementFor("#activity-log").innerHTML, /Human · Applied a protected commitment/);
  });

  await t.test("Human Restore is monotonic and replaces stale decision truth", async () => {
    const { app, elementFor } = await loadApp();
    app.findCompromise("Human");
    app.applyCompromise();
    assert.equal(app.getAppSnapshot().revision, 1);

    const restored = app.resetScenario();
    const snapshot = app.getAppSnapshot();
    assert.equal(restored.ok, true);
    assert.equal(snapshot.revision, 2);
    assert.deepEqual(snapshot.allocations, INITIAL_ALLOCATIONS);
    assert.match(elementFor("#decision-body").textContent, /Human restored/);
    assert.match(elementFor("#decision-revision").textContent, /revision 1 → 2/);
    assert.match(elementFor("#activity-log").innerHTML, /Human · Restored the human draft/);
  });

  await t.test("tool refusal synchronizes Youth Maker Hours and $305,000 without mutation", async () => {
    const { app, elementFor, tools } = await loadApp();
    const before = app.getAppSnapshot();
    const refused = JSON.parse(await tools.get("price_of_protecting").execute({
      proposalId: "youth-maker-hours",
      atLeast: 305_000,
    }));
    const after = app.getAppSnapshot();

    assert.equal(refused.ok, false);
    assert.equal(elementFor("#protect-target").value, "youth-maker-hours");
    assert.equal(elementFor("#protect-minimum").value, "305000");
    assert.equal(after.revision, 0);
    assert.equal(allocationBytes(after), allocationBytes(before));
    assert.match(elementFor("#activity-log").innerHTML, /Agent · Asked what protecting a commitment would cost/);
  });
});
