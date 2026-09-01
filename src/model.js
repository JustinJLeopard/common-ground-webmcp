export const BUDGET = 1_200_000;
export const ALLOCATION_STEP = 5_000;
export const SOLVER_STEP = 25_000;

export const PROPOSALS = Object.freeze([
  Object.freeze({
    id: "night-routes",
    name: "Night Routes",
    code: "01 / MOVE",
    description: "Late-evening lighting, walking loops, and staffed ride-home stops.",
    min: 100_000,
    max: 450_000,
    impactRate: 0.9,
    humanTarget: 425_000,
    agentTarget: 250_000,
  }),
  Object.freeze({
    id: "heatwave-commons",
    name: "Heatwave Commons",
    code: "02 / COOL",
    description: "Shade canopies, water stations, and cool-room operating grants.",
    min: 100_000,
    max: 400_000,
    impactRate: 0.94,
    humanTarget: 350_000,
    agentTarget: 225_000,
  }),
  Object.freeze({
    id: "corner-pantries",
    name: "Corner Pantry Network",
    code: "03 / NOURISH",
    description: "Five resident-run food pickup points with refrigerated storage.",
    min: 100_000,
    max: 350_000,
    impactRate: 0.82,
    humanTarget: 225_000,
    agentTarget: 225_000,
  }),
  Object.freeze({
    id: "youth-maker-hours",
    name: "Youth Maker Hours",
    code: "04 / GROW",
    description: "Paid studio hours, mentors, materials, and safe evening access.",
    min: 75_000,
    max: 350_000,
    impactRate: 0.78,
    humanTarget: 100_000,
    agentTarget: 275_000,
  }),
  Object.freeze({
    id: "care-link-rides",
    name: "Care Link Rides",
    code: "05 / CARE",
    description: "Door-to-door rides and appointment navigators for care access.",
    min: 75_000,
    max: 350_000,
    impactRate: 0.8,
    humanTarget: 100_000,
    agentTarget: 225_000,
  }),
]);

export const STAKEHOLDER_FLOORS = Object.freeze([
  Object.freeze({
    id: "young-people",
    label: "Young people",
    requirement: 340_000,
    description: "Direct youth hours plus the youth-weighted share of routes and pantries.",
    weights: Object.freeze({
      "night-routes": 0.35,
      "corner-pantries": 0.25,
      "youth-maker-hours": 1,
    }),
  }),
  Object.freeze({
    id: "older-residents",
    label: "Older residents",
    requirement: 300_000,
    description: "Care rides plus the older-resident share of cooling and food access.",
    weights: Object.freeze({
      "heatwave-commons": 0.35,
      "corner-pantries": 0.25,
      "care-link-rides": 1,
    }),
  }),
  Object.freeze({
    id: "outer-blocks",
    label: "Outer blocks",
    requirement: 420_000,
    description: "Geographic reach weighted toward routes, cooling, food, and care rides.",
    weights: Object.freeze({
      "night-routes": 0.45,
      "heatwave-commons": 0.45,
      "corner-pantries": 0.55,
      "care-link-rides": 0.35,
    }),
  }),
]);

export const INITIAL_ALLOCATIONS = Object.freeze({
  "night-routes": 425_000,
  "heatwave-commons": 350_000,
  "corner-pantries": 225_000,
  "youth-maker-hours": 100_000,
  "care-link-rides": 100_000,
});

const proposalById = new Map(PROPOSALS.map((proposal) => [proposal.id, proposal]));
const exactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function cloneAllocations(allocations) {
  return Object.fromEntries(
    PROPOSALS.map(({ id }) => [id, Number(allocations?.[id] ?? 0)]),
  );
}
function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function createInitialState() {
  return {
    allocations: cloneAllocations(INITIAL_ALLOCATIONS),
    revision: 0,
  };
}

export function calculateFloorValue(allocations, floor) {
  return round(
    Object.entries(floor.weights).reduce(
      (total, [proposalId, weight]) => total + (allocations[proposalId] ?? 0) * weight,
      0,
    ),
    0,
  );
}

export function evaluateScenario(rawAllocations) {
  const allocations = cloneAllocations(rawAllocations);
  const issues = [];

  for (const proposal of PROPOSALS) {
    const amount = allocations[proposal.id];
    if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
      issues.push({
        code: "amount_not_integer",
        proposalId: proposal.id,
        message: `${proposal.name} must be a whole-dollar amount.`,
      });
    } else if (amount < proposal.min || amount > proposal.max) {
      issues.push({
        code: "amount_out_of_range",
        proposalId: proposal.id,
        message: `${proposal.name} must stay between ${proposal.min} and ${proposal.max}.`,
      });
    } else if (amount % ALLOCATION_STEP !== 0) {
      issues.push({
        code: "amount_off_step",
        proposalId: proposal.id,
        message: `${proposal.name} must use ${ALLOCATION_STEP} dollar increments.`,
      });
    }
  }

  const total = Object.values(allocations).reduce((sum, amount) => sum + amount, 0);
  const budgetDelta = BUDGET - total;
  if (budgetDelta !== 0) {
    const budgetDifference = exactUsd.format(Math.abs(budgetDelta));
    issues.push({
      code: "budget_mismatch",
      message:
        budgetDelta > 0
          ? `${budgetDifference} remains unallocated.`
          : `${budgetDifference} must be removed to meet the fixed budget.`,
    });
  }

  const floors = STAKEHOLDER_FLOORS.map((floor) => {
    const value = calculateFloorValue(allocations, floor);
    const gap = value - floor.requirement;
    const met = gap >= 0;
    if (!met) {
      issues.push({
        code: "stakeholder_floor_missed",
        floorId: floor.id,
        message: `${floor.label} floor is short by ${Math.abs(gap)}.`,
      });
    }
    return {
      id: floor.id,
      label: floor.label,
      description: floor.description,
      value,
      requirement: floor.requirement,
      gap,
      met,
      coverage: round((value / floor.requirement) * 100),
    };
  });

  const weightedImpact = PROPOSALS.reduce(
    (sum, proposal) => sum + allocations[proposal.id] * proposal.impactRate,
    0,
  );
  const impactScore = Math.max(0, Math.min(100, (weightedImpact / (BUDGET * 0.94)) * 100));
  const preferenceDistance = PROPOSALS.reduce((sum, proposal) => {
    const midpoint = (proposal.humanTarget + proposal.agentTarget) / 2;
    return sum + Math.abs(allocations[proposal.id] - midpoint);
  }, 0);
  const consensusScore = Math.max(0, 100 - (preferenceDistance / BUDGET) * 100);
  const floorBalanceScore = Math.min(
    100,
    ...floors.map((floor) => (floor.value / floor.requirement) * 100),
  );
  const budgetScore = Math.max(0, 100 - (Math.abs(budgetDelta) / BUDGET) * 100);
  const score = round(
    impactScore * 0.45 +
      consensusScore * 0.25 +
      floorBalanceScore * 0.2 +
      budgetScore * 0.1,
  );

  return {
    allocations,
    total,
    budget: BUDGET,
    budgetDelta,
    floors,
    impactScore: round(impactScore),
    consensusScore: round(consensusScore),
    floorBalanceScore: round(floorBalanceScore),
    score,
    issues,
    valid: issues.length === 0,
    status: issues.length === 0 ? "feasible" : "needs-revision",
  };
}

function compareAllocationKey(left, right) {
  const leftKey = PROPOSALS.map(({ id }) => String(left[id]).padStart(7, "0")).join(":");
  const rightKey = PROPOSALS.map(({ id }) => String(right[id]).padStart(7, "0")).join(":");
  return leftKey.localeCompare(rightKey);
}

// One grid search, two questions.
//
// `findFeasibleCompromise` asks "what is the best feasible plan from here?".
// `priceOfProtecting` asks "what is the best feasible plan from here that also
// keeps one commitment at or above a floor a person named?". Those differ only
// by an extra hard constraint, so they must not be two searches: a second copy
// of the tie-break chain is a second place for determinism to drift.
//
// `accept` is applied only after validity, so the fixed budget, the per-proposal
// range/step rules, and every stakeholder floor stay hard constraints in both
// cases -- a protected minimum can never buy its way past a floor.
function searchFeasibleGrid(current, accept) {
  let best = null;
  let considered = 0;
  let feasible = 0;
  const candidate = {};

  function inspectCandidate() {
    considered += 1;
    const evaluation = evaluateScenario(candidate);
    if (!evaluation.valid) return;
    if (accept && !accept(candidate, evaluation)) return;
    feasible += 1;

    const changeDistance = PROPOSALS.reduce(
      (sum, { id }) => sum + Math.abs(candidate[id] - current[id]),
      0,
    );
    const objective = round(evaluation.score - (changeDistance / BUDGET) * 8, 4);
    const result = {
      allocations: cloneAllocations(candidate),
      evaluation,
      changeDistance,
      objective,
    };

    const isBetter =
      best === null ||
      result.objective > best.objective ||
      (result.objective === best.objective && result.evaluation.score > best.evaluation.score) ||
      (result.objective === best.objective &&
        result.evaluation.score === best.evaluation.score &&
        result.changeDistance < best.changeDistance) ||
      (result.objective === best.objective &&
        result.evaluation.score === best.evaluation.score &&
        result.changeDistance === best.changeDistance &&
        compareAllocationKey(result.allocations, best.allocations) < 0);

    if (isBetter) best = result;
  }

  function search(index, remaining) {
    const proposal = PROPOSALS[index];
    if (index === PROPOSALS.length - 1) {
      if (
        remaining >= proposal.min &&
        remaining <= proposal.max &&
        remaining % SOLVER_STEP === 0
      ) {
        candidate[proposal.id] = remaining;
        inspectCandidate();
      }
      return;
    }

    const rest = PROPOSALS.slice(index + 1);
    const restMin = rest.reduce((sum, item) => sum + item.min, 0);
    const restMax = rest.reduce((sum, item) => sum + item.max, 0);
    for (let amount = proposal.min; amount <= proposal.max; amount += SOLVER_STEP) {
      const nextRemaining = remaining - amount;
      if (nextRemaining < restMin || nextRemaining > restMax) continue;
      candidate[proposal.id] = amount;
      search(index + 1, nextRemaining);
    }
  }

  search(0, BUDGET);
  return { best, considered, feasible };
}

export function findFeasibleCompromise(rawAllocations) {
  const current = cloneAllocations(rawAllocations);
  const { best, considered } = searchFeasibleGrid(current, null);
  if (!best) return null;

  const deltas = Object.fromEntries(
    PROPOSALS.map(({ id }) => [id, best.allocations[id] - current[id]]),
  );
  return {
    ...best,
    deltas,
    considered,
    method:
      "Deterministic 25,000 dollar grid search; fixed budget and all floors are hard constraints, then score and change distance break ties.",
  };
}

export const PROTECTION_METHOD =
  "Deterministic 25,000 dollar grid search constrained to the protected minimum; the fixed budget and every stakeholder floor stay hard constraints, then score and change distance break ties.";

function protectionRefusal(proposalId, atLeast, code, message, details = {}) {
  return {
    ok: false,
    request: { proposalId: proposalId ?? null, atLeast: Number.isFinite(atLeast) ? atLeast : null },
    reason: { code, message, ...details },
    method: PROTECTION_METHOD,
  };
}

/**
 * Answer "what would it cost to protect this?" with an exact swap.
 *
 * The contract is deliberately all-or-nothing: either there is an allocation on
 * the shared grid that holds `proposalId` at or above `atLeast` while keeping
 * the budget exact and every floor met, or the honest answer is no. A nearest
 * approximation is never returned as a success -- "almost protected" is the one
 * answer that would let a group think a commitment was safe when it was not.
 */
export function priceOfProtecting(rawAllocations, request = {}) {
  const current = cloneAllocations(rawAllocations);
  const { proposalId } = request;
  const proposal = proposalById.get(proposalId);
  const atLeast = Number(request.atLeast);

  if (!proposal) {
    // Deliberately does not echo the requested id back into the message. The
    // caller can be an agent, so that string is untrusted input; the known
    // commitment names are listed instead, and the raw id stays in a
    // structured field that no renderer treats as markup.
    return protectionRefusal(
      proposalId,
      atLeast,
      "unknown_commitment",
      `That is not one of the five commitments in this scenario. Ask about ${PROPOSALS.map(({ name }) => name).join(", ")}.`,
      { known: PROPOSALS.map(({ id }) => id) },
    );
  }
  if (!Number.isInteger(atLeast)) {
    return protectionRefusal(
      proposalId,
      atLeast,
      "amount_not_integer",
      `A protected minimum for ${proposal.name} must be a whole-dollar amount.`,
    );
  }
  if (atLeast % ALLOCATION_STEP !== 0) {
    return protectionRefusal(
      proposalId,
      atLeast,
      "amount_off_step",
      `A protected minimum for ${proposal.name} must use ${exactUsd.format(ALLOCATION_STEP)} increments.`,
      { step: ALLOCATION_STEP },
    );
  }
  if (atLeast < proposal.min || atLeast > proposal.max) {
    return protectionRefusal(
      proposalId,
      atLeast,
      "amount_out_of_range",
      `${proposal.name} only ranges from ${exactUsd.format(proposal.min)} to ${exactUsd.format(proposal.max)} in this scenario.`,
      { min: proposal.min, max: proposal.max },
    );
  }

  const baseline = evaluateScenario(current);
  const { best, considered, feasible } = searchFeasibleGrid(
    current,
    (candidate) => candidate[proposalId] >= atLeast,
  );

  if (!best) {
    return protectionRefusal(
      proposalId,
      atLeast,
      "no_feasible_allocation",
      `No allocation on the ${exactUsd.format(SOLVER_STEP)} grid protects ${proposal.name} at ${exactUsd.format(atLeast)} without breaking the fixed budget or a stakeholder floor.`,
      { considered, feasible: 0 },
    );
  }

  const changes = PROPOSALS.map((item) => {
    const before = current[item.id];
    const after = best.allocations[item.id];
    const delta = after - before;
    return {
      proposalId: item.id,
      name: item.name,
      before,
      after,
      delta,
      direction: delta === 0 ? "unchanged" : delta > 0 ? "increase" : "reduction",
      label: `${item.name} ${delta === 0 ? "holds at" : delta > 0 ? "rises to" : "falls to"} ${exactUsd.format(after)}`,
      deltaLabel: delta === 0 ? "no change" : `${delta > 0 ? "+" : "−"}${exactUsd.format(Math.abs(delta))}`,
    };
  });

  const floors = baseline.floors.map((before, index) => {
    const after = best.evaluation.floors[index];
    return {
      id: before.id,
      label: before.label,
      requirement: before.requirement,
      before: before.value,
      after: after.value,
      beforeMet: before.met,
      afterMet: after.met,
      beforeGap: before.gap,
      afterGap: after.gap,
      movement: after.value === before.value ? "unchanged" : after.value > before.value ? "up" : "down",
    };
  });

  const total = best.evaluation.total;
  return {
    ok: true,
    request: { proposalId, atLeast },
    proposalName: proposal.name,
    requestedMinimum: atLeast,
    protectedAmount: best.allocations[proposalId],
    protectedExceedsRequest: best.allocations[proposalId] > atLeast,
    allocations: best.allocations,
    changes,
    reductions: changes.filter(({ direction }) => direction === "reduction"),
    increases: changes.filter(({ direction }) => direction === "increase"),
    floors,
    budgetProof: {
      budget: BUDGET,
      total,
      balanced: total === BUDGET,
      statement: `${exactUsd.format(total)} of ${exactUsd.format(BUDGET)} — the five commitments still sum to the fixed budget exactly.`,
    },
    evaluation: best.evaluation,
    changeDistance: best.changeDistance,
    considered,
    feasible,
    method: PROTECTION_METHOD,
  };
}

function rejected(state, action, message, details = {}) {
  return {
    ok: false,
    state,
    error: { code: "rejected_action", message, ...details },
    event: {
      kind: "rejected",
      action: action.type,
      beforeRevision: state.revision,
      afterRevision: state.revision,
      summary: message,
    },
  };
}

export function reduceScenario(state, action) {
  if (!state || !action || typeof action.type !== "string") {
    return rejected(state, action ?? { type: "UNKNOWN" }, "A valid state and action are required.");
  }

  if (action.type === "SET_ALLOCATION") {
    const proposal = proposalById.get(action.proposalId);
    if (!proposal) {
      return rejected(state, action, `Unknown proposal: ${action.proposalId}.`);
    }
    const amount = Number(action.amount);
    if (!Number.isInteger(amount)) {
      return rejected(state, action, `${proposal.name} requires a whole-dollar amount.`);
    }
    if (amount < proposal.min || amount > proposal.max) {
      return rejected(
        state,
        action,
        `${proposal.name} must stay between ${proposal.min} and ${proposal.max}.`,
        { proposalId: proposal.id, min: proposal.min, max: proposal.max },
      );
    }
    if (amount % ALLOCATION_STEP !== 0) {
      return rejected(
        state,
        action,
        `${proposal.name} must use ${ALLOCATION_STEP} dollar increments.`,
        { proposalId: proposal.id, step: ALLOCATION_STEP },
      );
    }

    const before = state.allocations[proposal.id];
    const allocations = { ...state.allocations, [proposal.id]: amount };
    const total = Object.values(allocations).reduce((sum, allocation) => sum + allocation, 0);
    if (total > BUDGET) {
      return rejected(
        state,
        action,
        `The fixed ${BUDGET} budget would be exceeded by ${total - BUDGET}.`,
        { proposalId: proposal.id, total, budget: BUDGET, overage: total - BUDGET },
      );
    }
    const nextState = { allocations, revision: state.revision + 1 };
    return {
      ok: true,
      state: nextState,
      evaluation: evaluateScenario(allocations),
      event: {
        kind: "mutation",
        action: action.type,
        proposalId: proposal.id,
        beforeRevision: state.revision,
        afterRevision: nextState.revision,
        before,
        after: amount,
        summary: `${proposal.name} changed from ${before} to ${amount}.`,
      },
    };
  }

  if (action.type === "APPLY_COMPROMISE") {
    const compromise = findFeasibleCompromise(state.allocations);
    if (!compromise) {
      return rejected(state, action, "No feasible compromise exists for this fixture.");
    }
    const nextState = {
      allocations: cloneAllocations(compromise.allocations),
      revision: state.revision + 1,
    };
    return {
      ok: true,
      state: nextState,
      evaluation: compromise.evaluation,
      compromise,
      event: {
        kind: "mutation",
        action: action.type,
        beforeRevision: state.revision,
        afterRevision: nextState.revision,
        before: cloneAllocations(state.allocations),
        after: cloneAllocations(nextState.allocations),
        summary: `Applied a feasible compromise after checking ${compromise.considered} candidate allocations.`,
      },
    };
  }

  if (action.type === "RESET_SCENARIO") {
    const nextState = {
      allocations: cloneAllocations(INITIAL_ALLOCATIONS),
      revision: state.revision + 1,
    };
    return {
      ok: true,
      state: nextState,
      evaluation: evaluateScenario(nextState.allocations),
      event: {
        kind: "mutation",
        action: action.type,
        beforeRevision: state.revision,
        afterRevision: nextState.revision,
        before: cloneAllocations(state.allocations),
        after: cloneAllocations(nextState.allocations),
        summary: "Restored the tempting opening allocation.",
      },
    };
  }

  return rejected(state, action, `Unsupported action: ${action.type}.`);
}
