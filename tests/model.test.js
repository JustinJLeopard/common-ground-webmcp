import assert from "node:assert/strict";
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

test("the opening brief is a fixed-budget but stakeholder-incomplete human draft", () => {
  const evaluation = evaluateScenario(INITIAL_ALLOCATIONS);
  assert.equal(evaluation.total, BUDGET);
  assert.equal(evaluation.valid, false);
  assert.ok(evaluation.floors.some((floor) => !floor.met));
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
