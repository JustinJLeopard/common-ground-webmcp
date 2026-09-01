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
  priceOfProtecting,
  reduceScenario,
} from "../src/model.js";

// The demo case, asserted from source truth rather than trusted.
const DEMO = { proposalId: "care-link-rides", atLeast: 225_000 };
const IMPOSSIBLE = { proposalId: "youth-maker-hours", atLeast: 305_000 };

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

test("protecting a reachable commitment returns an exact, still-balanced swap", () => {
  const result = priceOfProtecting(INITIAL_ALLOCATIONS, DEMO);
  assert.equal(result.ok, true);

  // The requested minimum is actually held, and the plan is valid under the
  // same rules the rest of the app uses.
  assert.ok(result.protectedAmount >= DEMO.atLeast);
  assert.equal(result.evaluation.valid, true);
  assert.equal(result.budgetProof.balanced, true);
  assert.equal(result.budgetProof.total, BUDGET);
  assert.equal(
    Object.values(result.allocations).reduce((sum, amount) => sum + amount, 0),
    BUDGET,
  );

  // Every commitment is named with an exact signed delta, and every floor is
  // reported before and after -- not just the ones that moved.
  assert.equal(result.changes.length, PROPOSALS.length);
  for (const change of result.changes) {
    assert.equal(change.after - change.before, change.delta);
  }
  assert.equal(result.floors.length, 3);
  for (const floor of result.floors) {
    assert.equal(typeof floor.before, "number");
    assert.equal(typeof floor.after, "number");
    assert.equal(typeof floor.beforeMet, "boolean");
    assert.equal(typeof floor.afterMet, "boolean");
  }
});

test("an impossible protection is refused, never approximated", () => {
  const result = priceOfProtecting(INITIAL_ALLOCATIONS, IMPOSSIBLE);
  assert.equal(result.ok, false);
  assert.equal(result.reason.code, "no_feasible_allocation");

  // The whole point: a near miss must not be returned dressed as a plan. If
  // any of these ever appear on a refusal, the UI could render an allocation
  // that does not actually protect what was asked for.
  assert.equal(Object.hasOwn(result, "allocations"), false);
  assert.equal(Object.hasOwn(result, "protectedAmount"), false);
  assert.equal(Object.hasOwn(result, "changes"), false);

  // And it is genuinely impossible rather than merely out of range: the target
  // sits inside the commitment's own declared band.
  const proposal = PROPOSALS.find(({ id }) => id === IMPOSSIBLE.proposalId);
  assert.ok(IMPOSSIBLE.atLeast >= proposal.min && IMPOSSIBLE.atLeast <= proposal.max);
});

test("the same protection question returns byte-equivalent data twice", () => {
  const first = priceOfProtecting(INITIAL_ALLOCATIONS, DEMO);
  const second = priceOfProtecting(INITIAL_ALLOCATIONS, DEMO);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("pricing a protection never mutates the allocation it was asked about", () => {
  const state = createInitialState();
  const before = structuredClone(state.allocations);
  const revisionBefore = state.revision;

  const result = priceOfProtecting(state.allocations, DEMO);
  assert.equal(result.ok, true);

  // The proposal exists, and the scenario it was measured against is untouched.
  assert.deepEqual(state.allocations, before);
  assert.equal(state.revision, revisionBefore);
  assert.notDeepEqual(result.allocations, state.allocations);
});

const toolTable = async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  return appSource.slice(
    appSource.indexOf("const WEBMCP_TOOLS = ["),
    appSource.indexOf("function wireHumanControls"),
  );
};

test("no registered WebMCP tool can apply a protection", async () => {
  const table = await toolTable();
  assert.ok(table.includes("price_of_protecting"));
  // Applying a priced swap is a human action. If applyProtection ever becomes
  // reachable from the tool table, the agent can commit the very tradeoff this
  // product promises only a person can commit.
  assert.doesNotMatch(table, /applyProtection/);
  assert.match(table, /name: "price_of_protecting"[\s\S]*?readOnlyHint: true/);
});

test("no registered WebMCP tool accepts an arbitrary allocation write", async () => {
  // The predecessor of this test asserted that applyProtection was absent from
  // the tool table, and concluded the agent could not commit a priced swap.
  // That was false. A registered `set_allocation` writer let an agent replay
  // the four priced amounts in reduction-first order -- every step in range,
  // on the $5,000 step, and under budget -- and land on the exact proposed
  // allocation with no human click. Absence of a name is not a boundary; what
  // matters is whether any registered surface accepts a caller-chosen amount.
  const table = await toolTable();
  assert.doesNotMatch(table, /name: "set_allocation"/);

  const blocks = table.split(/^  \{$/m).filter((block) => block.includes("name: \""));
  assert.equal(blocks.length, 7);

  for (const block of blocks) {
    const name = block.match(/name: "([a-z_]+)"/)[1];
    const mutating = /readOnlyHint: false/.test(block);
    if (!mutating) continue;
    // A mutating tool may exist, but it must not take an allocation amount.
    assert.doesNotMatch(
      block,
      /amount:/,
      `${name} is mutating and accepts an amount: that is an arbitrary allocation write`,
    );
  }
});

test("the priced protection is unreachable through the registered mutating tools", async () => {
  const priced = priceOfProtecting(INITIAL_ALLOCATIONS, DEMO).allocations;
  const key = (allocations) => PROPOSALS.map(({ id }) => allocations[id]).join(":");

  // Every action a registered mutating tool can perform. Neither takes a
  // caller-chosen allocation, so the reachable set is closed and computable.
  const AGENT_ACTIONS = [{ type: "APPLY_COMPROMISE" }, { type: "RESET_SCENARIO" }];

  // This list is an assumption about the tool table, and an unchecked
  // assumption is how the original bypass survived review: the reachable set
  // is only meaningful if these really are the only mutating tools. Derive the
  // real set and fail loudly if a new writer ever appears.
  const table = await toolTable();
  const mutating = table
    .split(/^  \{$/m)
    .filter((block) => /readOnlyHint: false/.test(block))
    .map((block) => block.match(/name: "([a-z_]+)"/)[1])
    .sort();
  assert.deepEqual(
    mutating,
    ["apply_compromise", "reset_scenario"],
    "a mutating tool appeared that this reachability proof does not model",
  );

  const seen = new Map([[key(INITIAL_ALLOCATIONS), createInitialState()]]);
  const queue = [createInitialState()];
  while (queue.length) {
    const current = queue.shift();
    for (const action of AGENT_ACTIONS) {
      const result = reduceScenario(current, action);
      if (!result.ok) continue;
      const k = key(result.state.allocations);
      if (seen.has(k)) continue;
      seen.set(k, result.state);
      queue.push(result.state);
    }
  }

  // Positive control first: a reachability proof that explores nothing would
  // "prove" anything. The agent must genuinely be able to reach the solver's
  // own compromise, which is a state it is allowed to reach.
  const compromise = findFeasibleCompromise(INITIAL_ALLOCATIONS);
  assert.ok(seen.size >= 2, "closure did not explore; the search is broken, not the boundary");
  assert.ok(seen.has(key(compromise.allocations)), "apply_compromise should be reachable");

  // The actual claim.
  assert.equal(
    seen.has(key(priced)),
    false,
    `the priced protection ${key(priced)} is reachable by the agent alone; reachable set was ${[...seen.keys()].join(" | ")}`,
  );
});

test("the preview tool cannot assign shared state", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const start = appSource.indexOf("function previewAllocation");
  const body = appSource.slice(start, appSource.indexOf("\nfunction ", start + 1));
  assert.ok(start > 0, "previewAllocation must exist");
  // The one line that would make the preview a writer again.
  assert.doesNotMatch(body, /(^|[^.\w])state\s*=[^=]/);
});

test("the documented demo case matches what the model actually returns", async () => {
  // The think-tank packet that proposed this feature quoted deltas that the
  // model does not produce. This test exists so the README can never drift
  // back into a persuasive number nobody re-derived.
  const result = priceOfProtecting(INITIAL_ALLOCATIONS, DEMO);
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  const usd = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });

  assert.ok(readme.includes(usd.format(result.protectedAmount)));
  for (const change of result.changes) {
    if (change.delta === 0) continue;
    assert.ok(
      readme.includes(`${change.name}`) && readme.includes(usd.format(Math.abs(change.delta))),
      `README must state the real ${change.name} delta of ${usd.format(Math.abs(change.delta))}`,
    );
  }
});
