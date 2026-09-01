import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BUDGET,
  INITIAL_ALLOCATIONS,
  PROPOSALS,
  createInitialState,
  evaluateScenario,
  findFeasibleCompromise,
  reduceScenario,
} from "../src/model.js";

test("allocation inputs reference their rendered proposal descriptions", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(
    appSource,
    /<span id="proposal-\$\{proposal\.id\}" class="proposal-description">\$\{proposal\.description\}<\/span>/,
  );
  assert.match(appSource, /aria-describedby="proposal-\$\{proposal\.id\}"/);
});

test("the opening brief is a fixed-budget but stakeholder-incomplete human draft", () => {
  const evaluation = evaluateScenario(INITIAL_ALLOCATIONS);
  assert.equal(evaluation.total, BUDGET);
  assert.equal(evaluation.valid, false);
  assert.ok(evaluation.floors.some((floor) => !floor.met));
});

test("budget mismatch issues show exact USD for underages and overages", () => {
  const cases = [
    {
      allocations: {
        ...INITIAL_ALLOCATIONS,
        "night-routes": INITIAL_ALLOCATIONS["night-routes"] - 5_000,
      },
      message: "$5,000 remains unallocated.",
    },
    {
      allocations: {
        ...INITIAL_ALLOCATIONS,
        "night-routes": INITIAL_ALLOCATIONS["night-routes"] + 5_000,
      },
      message: "$5,000 must be removed to meet the fixed budget.",
    },
  ];

  for (const { allocations, message } of cases) {
    const issue = evaluateScenario(allocations).issues.find(
      ({ code }) => code === "budget_mismatch",
    );
    assert.equal(issue?.message, message);
  }
});

test("a tempting extra allocation is rejected by the shared fixed-budget reducer", () => {
  const result = reduceScenario(createInitialState(), {
    type: "SET_ALLOCATION",
    proposalId: "night-routes",
    amount: 450_000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.overage, 25_000);
  assert.equal(result.state.allocations["night-routes"], INITIAL_ALLOCATIONS["night-routes"]);
});

test("the deterministic solver returns one reproducible valid compromise", () => {
  const first = findFeasibleCompromise(INITIAL_ALLOCATIONS);
  const second = findFeasibleCompromise(INITIAL_ALLOCATIONS);
  assert.ok(first);
  assert.deepEqual(first.allocations, second.allocations);
  assert.equal(first.evaluation.valid, true);
  assert.equal(first.evaluation.total, BUDGET);
  assert.ok(first.considered > 0);
});

test("the solver output changes the opening draft and preserves every proposal identity", () => {
  const state = createInitialState();
  const compromise = findFeasibleCompromise(state.allocations);
  assert.ok(compromise);
  assert.notDeepEqual(compromise.allocations, state.allocations);
  assert.deepEqual(Object.keys(compromise.allocations).sort(), PROPOSALS.map(({ id }) => id).sort());
});

test("apply and reset are deterministic state transitions", () => {
  const opening = createInitialState();
  const applied = reduceScenario(opening, { type: "APPLY_COMPROMISE" });
  assert.equal(applied.ok, true);
  assert.equal(applied.evaluation.valid, true);
  assert.equal(applied.state.revision, 1);

  const reset = reduceScenario(applied.state, { type: "RESET_SCENARIO" });
  assert.equal(reset.ok, true);
  assert.deepEqual(reset.state.allocations, opening.allocations);
  assert.equal(reset.state.revision, 2);
});

test("headline budget figures resolve at the product's $5,000 granularity", async () => {
  // Why this test exists, in behavioural terms rather than as a restatement of
  // the diff: allocations move in $5,000 steps, so the headline must be able to
  // show the difference between a fully committed budget and one that is $5,000
  // short. Compact notation cannot, at any configuration.
  const compactVariants = [
    { maximumFractionDigits: 0 },
    { maximumFractionDigits: 1 },
    { maximumFractionDigits: 2 },
    { maximumSignificantDigits: 3 },
  ];
  for (const opts of compactVariants) {
    const compact = new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", notation: "compact", ...opts,
    });
    assert.equal(
      compact.format(BUDGET),
      compact.format(BUDGET - 5_000),
      `compact ${JSON.stringify(opts)} was expected to collide; if this fails the
       collision assumption behind the exact-currency headline has changed`,
    );
  }

  const exact = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });
  assert.notEqual(exact.format(BUDGET), exact.format(BUDGET - 5_000));
  assert.equal(exact.format(BUDGET), "$1,200,000");
});

test("renderMetrics uses exact currency for the headline total and budget label", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const body = appSource.slice(appSource.indexOf("function renderMetrics"));
  // Strip comment lines: prose explaining why compact was removed legitimately
  // mentions formatCompactMoney, and must not fail the assertion about code.
  const block = body
    .slice(0, body.indexOf("dom.scoreValue"))
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.match(block, /const totalLabel = formatMoney\(evaluation\.total\)/);
  assert.doesNotMatch(
    block,
    /formatCompactMoney/,
    "the headline total and over/under-budget label must not use compact notation",
  );
});
