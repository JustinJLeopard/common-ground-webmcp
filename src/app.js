import {
  ALLOCATION_STEP,
  BUDGET,
  INITIAL_ALLOCATIONS,
  PROPOSALS,
  createInitialState,
  evaluateScenario,
  findFeasibleCompromise,
} from "./model.js";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

const dom = {
  allocationsBody: document.querySelector("#allocations-body"),
  activityLog: document.querySelector("#activity-log"),
  budgetLabel: document.querySelector("#budget-label"),
  budgetMeter: document.querySelector("#budget-meter"),
  floorList: document.querySelector("#floor-list"),
  floorsValue: document.querySelector("#floors-value"),
  formFeedback: document.querySelector("#form-feedback"),
  logCount: document.querySelector("#log-count"),
  scenarioStatus: document.querySelector("#scenario-status"),
  scoreValue: document.querySelector("#score-value"),
  solverStatus: document.querySelector("#solver-status"),
  stateMessage: document.querySelector("#state-message"),
  totalValue: document.querySelector("#total-value"),
  toolCatalog: document.querySelector("#tool-catalog"),
  webmcpStatus: document.querySelector("#webmcp-status"),
  compromiseCopy: document.querySelector("#compromise-copy"),
  compromiseSummary: document.querySelector("#compromise-summary"),
  applyButton: document.querySelector('[data-action="apply"]'),
};

let state = createInitialState();
let proposedCompromise = null;
let feedback = "";
let activities = [];

const formatMoney = (value) => currency.format(value);
const formatCompactMoney = (value) => compactCurrency.format(value).replace("K", "k");
const proposalById = new Map(PROPOSALS.map((proposal) => [proposal.id, proposal]));

function nowStamp() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function publicEvaluation(evaluation = evaluateScenario(state.allocations)) {
  return {
    status: evaluation.status,
    total: evaluation.total,
    budget: evaluation.budget,
    budgetDelta: evaluation.budgetDelta,
    score: evaluation.score,
    constraintsMet: evaluation.floors.filter((floor) => floor.met).length,
    constraintsTotal: evaluation.floors.length,
    floors: evaluation.floors.map(({ id, label, value, requirement, gap, met }) => ({
      id,
      label,
      value,
      requirement,
      gap,
      met,
    })),
    allocations: evaluation.allocations,
    issues: evaluation.issues.map(({ code, message, proposalId, floorId }) => ({
      code,
      message,
      proposalId,
      floorId,
    })),
  };
}

function safeResult(result) {
  return JSON.stringify(result, null, 2);
}

function addActivity({ actor, action, detail, tool = null, result = "" }) {
  activities = [
    {
      id: `${Date.now()}-${Math.random()}`,
      actor,
      action,
      detail,
      tool,
      result,
      time: nowStamp(),
    },
    ...activities,
  ].slice(0, 12);
}

function setFeedback(message, kind = "") {
  feedback = message;
  dom.formFeedback.textContent = message;
  dom.formFeedback.className = `form-feedback ${kind}`;
}

function renderAllocations(evaluation) {
  dom.allocationsBody.innerHTML = PROPOSALS.map((proposal) => {
    const amount = evaluation.allocations[proposal.id];
    return `
      <tr>
        <td>
          <span class="proposal-code">${proposal.code}</span>
          <span class="proposal-name">${proposal.name}</span>
        </td>
        <td><span id="proposal-${proposal.id}" class="proposal-description">${proposal.description}</span></td>
        <td>
          <div class="allocation-control" data-proposal="${proposal.id}">
            <button type="button" data-change="-" aria-label="Decrease ${proposal.name} by ${formatMoney(ALLOCATION_STEP)}">−</button>
            <input id="amount-${proposal.id}" data-amount="${proposal.id}" type="number" min="${proposal.min}" max="${proposal.max}" step="${ALLOCATION_STEP}" value="${amount}" aria-label="Allocation for ${proposal.name} in dollars" aria-describedby="proposal-${proposal.id}" />
            <button type="button" data-change="+" aria-label="Increase ${proposal.name} by ${formatMoney(ALLOCATION_STEP)}">+</button>
          </div>
        </td>
        <td><span class="reference">${formatCompactMoney(proposal.humanTarget)}</span></td>
        <td><span class="reference">${formatCompactMoney(proposal.agentTarget)}</span></td>
      </tr>
    `;
  }).join("");
}

function renderFloors(evaluation) {
  dom.floorList.innerHTML = evaluation.floors.map((floor) => `
    <article class="floor-item ${floor.met ? "met" : "failed"}">
      <div class="floor-title"><strong>${floor.label}</strong><output>${formatCompactMoney(floor.value)} / ${formatCompactMoney(floor.requirement)}</output></div>
      <p class="floor-detail">${floor.description}</p>
      <span class="floor-state">${floor.met ? "Floor protected" : `${formatCompactMoney(Math.abs(floor.gap))} still missing`}</span>
    </article>
  `).join("");
}

function renderMetrics(evaluation) {
  const constraintsMet = evaluation.floors.filter((floor) => floor.met).length;
  const percent = Math.max(0, Math.min(100, (evaluation.total / BUDGET) * 100));
  const totalLabel = formatCompactMoney(evaluation.total);
  const budgetText = evaluation.budgetDelta === 0
    ? `${totalLabel} of ${formatCompactMoney(BUDGET)} committed`
    : evaluation.budgetDelta > 0
      ? `${formatCompactMoney(evaluation.budgetDelta)} unallocated`
      : `${formatCompactMoney(Math.abs(evaluation.budgetDelta))} over budget`;
  dom.totalValue.textContent = totalLabel;
  dom.scoreValue.textContent = `${evaluation.score}/100`;
  dom.floorsValue.textContent = `${constraintsMet}/${evaluation.floors.length}`;
  dom.budgetLabel.textContent = budgetText;
  dom.budgetMeter.style.width = `${percent}%`;
  dom.budgetMeter.parentElement.classList.toggle("over", evaluation.total > BUDGET);
  dom.budgetMeter.parentElement.setAttribute("aria-valuenow", String(evaluation.total));
  dom.scenarioStatus.textContent = evaluation.valid ? "Feasible" : "Needs revision";
  dom.scenarioStatus.className = `state-label ${evaluation.status}`;
  if (evaluation.valid) {
    dom.stateMessage.textContent = "Every dollar is assigned and every stakeholder floor is protected. This is a feasible, auditable plan.";
  } else {
    const missing = evaluation.floors.filter((floor) => !floor.met).map((floor) => floor.label).join(" and ");
    const budgetIssue = evaluation.issues.find((issue) => issue.code === "budget_mismatch");
    dom.stateMessage.textContent = budgetIssue
      ? `${budgetIssue.message} ${missing ? `The current draft also leaves ${missing} below its stated floor.` : ""}`
      : `The draft balances the headline total, but it leaves ${missing} below its stated floor.`;
  }
}

function renderLog() {
  dom.logCount.textContent = `${activities.length} ${activities.length === 1 ? "event" : "events"}`;
  dom.activityLog.innerHTML = activities.length
    ? activities.map((activity, index) => `
      <li>
        <span class="log-index">${String(activities.length - index).padStart(2, "0")}</span>
        <div class="log-copy">
          <strong>${activity.actor} · ${activity.action}</strong>
          <span>${activity.detail}${activity.tool ? ` <code>${activity.tool}</code>` : ""} · ${activity.time}</span>
        </div>
      </li>
    `).join("")
    : "<li><span class=\"log-index\">00</span><div class=\"log-copy\"><strong>Waiting for a shared action</strong><span>Human controls and WebMCP tools will appear here.</span></div></li>";
}

function renderCompromise() {
  const applyButton = dom.applyButton;
  if (!proposedCompromise) {
    dom.solverStatus.textContent = "Not requested";
    dom.compromiseSummary.hidden = true;
    applyButton.disabled = true;
    return;
  }
  const { evaluation, deltas, considered } = proposedCompromise;
  dom.solverStatus.textContent = "Feasible recommendation ready";
  dom.compromiseSummary.hidden = false;
  dom.compromiseSummary.innerHTML = `
    <p><strong>${formatMoney(evaluation.total)}</strong> meets all three floors with a shared score of <strong>${evaluation.score}/100</strong>. The deterministic search considered ${considered.toLocaleString()} valid candidate paths.</p>
    <ul>${PROPOSALS.map((proposal) => {
      const delta = deltas[proposal.id];
      const className = delta >= 0 ? "delta-positive" : "delta-negative";
      const sign = delta >= 0 ? "+" : "−";
      return `<li><span>${proposal.name}</span><strong class="${className}">${sign}${formatCompactMoney(Math.abs(delta))}</strong></li>`;
    }).join("")}</ul>
  `;
  applyButton.disabled = false;
}

function renderToolCatalog() {
  dom.toolCatalog.innerHTML = WEBMCP_TOOLS.map((tool) => `
    <article class="tool-card">
      <header><code>${tool.name}</code><span class="tool-mode">${tool.annotations.readOnlyHint ? "read only" : "changes state"}</span></header>
      <p>${tool.description}</p>
      <span class="tool-schema">${tool.schemaLabel}</span>
    </article>
  `).join("");
}

function render() {
  const evaluation = evaluateScenario(state.allocations);
  renderMetrics(evaluation);
  renderFloors(evaluation);
  renderAllocations(evaluation);
  renderLog();
  renderCompromise();
}

function validateAmount(proposal, amount) {
  if (!Number.isInteger(amount)) return `${proposal.name} needs a whole-dollar amount.`;
  if (amount < proposal.min || amount > proposal.max) {
    return `${proposal.name} must stay between ${formatMoney(proposal.min)} and ${formatMoney(proposal.max)}.`;
  }
  if (amount % ALLOCATION_STEP !== 0) return `${proposal.name} must use ${formatMoney(ALLOCATION_STEP)} increments.`;
  return null;
}

function setAllocation(proposalId, rawAmount, actor = "Human", source = "control") {
  const proposal = proposalById.get(proposalId);
  const amount = Number(rawAmount);
  if (!proposal) {
    const result = { ok: false, reason: "unknown_proposal", proposalId };
    setFeedback("That commitment is not part of this scenario.");
    return result;
  }
  const validation = validateAmount(proposal, amount);
  if (validation) {
    const result = { ok: false, reason: "invalid_amount", message: validation };
    setFeedback(validation);
    addActivity({ actor, action: "Rejected an invalid edit", detail: validation, tool: source.startsWith("tool") ? "set_allocation" : null });
    render();
    return result;
  }
  const candidate = { ...state.allocations, [proposalId]: amount };
  const evaluation = evaluateScenario(candidate);
  if (evaluation.total > BUDGET) {
    const overage = evaluation.total - BUDGET;
    const message = `Rejected: that change would break the fixed budget by ${formatMoney(overage)}.`;
    setFeedback(message);
    addActivity({ actor, action: "Rejected an over-budget move", detail: `${proposal.name} cannot increase to ${formatCompactMoney(amount)} without removing ${formatCompactMoney(overage)} elsewhere.`, tool: source.startsWith("tool") ? "set_allocation" : null });
    render();
    return { ok: false, reason: "budget_exceeded", proposalId, amount, overage, evaluation: publicEvaluation(evaluation) };
  }
  state = { allocations: candidate, revision: state.revision + 1 };
  proposedCompromise = null;
  setFeedback(`${proposal.name} is now ${formatMoney(amount)}. The shared scenario was updated.`, "ok");
  addActivity({ actor, action: "Updated a commitment", detail: `${proposal.name} is now ${formatCompactMoney(amount)}. The rules engine recalculated every floor.`, tool: source.startsWith("tool") ? "set_allocation" : null });
  render();
  return { ok: true, proposalId, amount, evaluation: publicEvaluation() };
}

function evaluateTradeoffs(actor = "Human", focus = "all", tool = null) {
  const evaluation = publicEvaluation();
  const message = evaluation.status === "feasible"
    ? "All constraints are satisfied; this draft can be discussed as a complete plan."
    : `${evaluation.issues.length} visible constraint ${evaluation.issues.length === 1 ? "needs" : "need"} attention.`;
  addActivity({ actor, action: "Inspected the tradeoffs", detail: `${message} Focus: ${focus}.`, tool });
  render();
  return { ...evaluation, focus, explanation: message };
}

function findCompromise(actor = "Human", tool = null) {
  proposedCompromise = findFeasibleCompromise(state.allocations);
  if (!proposedCompromise) {
    addActivity({ actor, action: "Could not find a compromise", detail: "No candidate met the hard constraints on the configured grid.", tool });
    render();
    return { ok: false, reason: "no_feasible_compromise" };
  }
  const { evaluation, considered, deltas } = proposedCompromise;
  addActivity({ actor, action: "Found a feasible compromise", detail: `Searched ${considered.toLocaleString()} deterministic candidate paths; the recommendation meets all floors at ${evaluation.score}/100.`, tool });
  render();
  return {
    ok: true,
    method: proposedCompromise.method,
    considered,
    allocations: proposedCompromise.allocations,
    deltas,
    evaluation: publicEvaluation(evaluation),
  };
}

function applyCompromise(actor = "Human", tool = null) {
  if (!proposedCompromise) {
    const message = "There is no pending compromise. Find one before applying it.";
    setFeedback(message);
    addActivity({ actor, action: "Could not apply a compromise", detail: message, tool });
    render();
    return { ok: false, reason: "no_pending_compromise", message };
  }
  state = { allocations: { ...proposedCompromise.allocations }, revision: state.revision + 1 };
  const evaluation = evaluateScenario(state.allocations);
  setFeedback("Compromise applied. The new allocation is feasible and every floor is protected.", "ok");
  addActivity({ actor, action: "Applied the shared compromise", detail: `The live scenario is now feasible: ${formatCompactMoney(evaluation.total)} committed, ${evaluation.floors.length}/${evaluation.floors.length} floors protected.`, tool });
  proposedCompromise = null;
  render();
  return { ok: true, evaluation: publicEvaluation(evaluation) };
}

function resetScenario(actor = "Human", tool = null) {
  state = createInitialState();
  proposedCompromise = null;
  setFeedback("Restored the original human draft. Nothing was hidden or discarded.", "ok");
  addActivity({ actor, action: "Restored the human draft", detail: "The exact opening priorities are back on the shared canvas.", tool });
  render();
  return { ok: true, evaluation: publicEvaluation() };
}

const WEBMCP_TOOLS = [
  {
    name: "get_scenario_state",
    title: "Get the current Common Ground scenario",
    description: "Read the current budget allocation, every stakeholder floor, visible issues, and deterministic score before proposing a change.",
    schemaLabel: "input: {} · output: allocation + floors + issues",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const result = publicEvaluation();
      addActivity({ actor: "Agent", action: "Read the shared scenario", detail: `Observed ${formatCompactMoney(result.total)} and ${result.constraintsMet}/${result.constraintsTotal} protected floors.`, tool: "get_scenario_state" });
      render();
      return safeResult(result);
    },
  },
  {
    name: "set_allocation",
    title: "Set one community commitment",
    description: "Set a single proposal allocation in $5,000 increments. The application rejects an invalid amount or a move that exceeds the fixed budget.",
    schemaLabel: "input: { proposalId, amount } · output: accepted or rejected state transition",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: { type: "string", enum: PROPOSALS.map(({ id }) => id), description: "Commitment to update." },
        amount: { type: "integer", minimum: 0, description: "Whole-dollar allocation in $5,000 increments." },
      },
      required: ["proposalId", "amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async ({ proposalId, amount }) => safeResult(setAllocation(proposalId, amount, "Agent", "tool:set_allocation")),
  },
  {
    name: "evaluate_tradeoffs",
    title: "Evaluate visible budget tradeoffs",
    description: "Explain the current deterministic score, fixed budget, stakeholder floors, and any precise constraints that still need attention.",
    schemaLabel: "input: { focus? } · output: current evaluation",
    inputSchema: {
      type: "object",
      properties: { focus: { type: "string", enum: ["all", "budget", "stakeholders", "consensus"], description: "A reading lens for the returned state." } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async ({ focus = "all" } = {}) => safeResult(evaluateTradeoffs("Agent", focus, "evaluate_tradeoffs")),
  },
  {
    name: "find_feasible_compromise",
    title: "Find a deterministic feasible compromise",
    description: "Search the configured allocation grid for a plan that uses the full budget, meets every stakeholder floor, maximizes the transparent shared score, and minimizes unnecessary changes from the current draft.",
    schemaLabel: "input: {} · output: reproducible recommendation + deltas",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => safeResult(findCompromise("Agent", "find_feasible_compromise")),
  },
  {
    name: "apply_compromise",
    title: "Apply the pending feasible compromise",
    description: "Apply the latest deterministic recommendation to the shared live scenario. Use only after inspecting the proposal and confirming the human intent.",
    schemaLabel: "input: {} · output: mutation receipt + new evaluation",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute: async () => safeResult(applyCompromise("Agent", "apply_compromise")),
  },
  {
    name: "reset_scenario",
    title: "Restore the opening human draft",
    description: "Restore the exact seeded opening priorities and remove any uncommitted compromise from the shared local scenario.",
    schemaLabel: "input: {} · output: reset state receipt",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute: async () => safeResult(resetScenario("Agent", "reset_scenario")),
  },
];

function wireHumanControls() {
  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const { action } = actionButton.dataset;
      if (action === "find") findCompromise();
      if (action === "apply") applyCompromise();
      if (action === "reset") resetScenario();
      if (action === "stress") setAllocation("night-routes", 450_000, "Human", "stress-test");
      return;
    }
    const changeButton = event.target.closest("[data-change]");
    if (!changeButton) return;
    const control = changeButton.closest("[data-proposal]");
    const proposalId = control.dataset.proposal;
    const current = state.allocations[proposalId];
    const amount = current + (changeButton.dataset.change === "+" ? ALLOCATION_STEP : -ALLOCATION_STEP);
    setAllocation(proposalId, amount);
  });

  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-amount]");
    if (!input) return;
    const result = setAllocation(input.dataset.amount, input.value);
    input.setAttribute("aria-invalid", String(!result.ok));
  });
}

async function registerWebMcpTools() {
  if (!document.modelContext?.registerTool) {
    dom.webmcpStatus.textContent = "WebMCP unavailable — UI still works";
    dom.webmcpStatus.className = "status-chip unavailable";
    addActivity({ actor: "System", action: "Prepared the local studio", detail: "WebMCP is not exposed in this browser context. The same deterministic human controls remain available." });
    render();
    return;
  }
  try {
    for (const tool of WEBMCP_TOOLS) {
      await document.modelContext.registerTool({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        execute: tool.execute,
      });
    }
    dom.webmcpStatus.textContent = `${WEBMCP_TOOLS.length} WebMCP tools live`;
    dom.webmcpStatus.className = "status-chip ready";
    addActivity({ actor: "System", action: "Registered the WebMCP contract", detail: `${WEBMCP_TOOLS.length} typed tools now share this exact scenario state.` });
  } catch (error) {
    dom.webmcpStatus.textContent = "WebMCP registration failed — UI still works";
    dom.webmcpStatus.className = "status-chip unavailable";
    addActivity({ actor: "System", action: "Could not register WebMCP", detail: error instanceof Error ? error.message : "Unknown registration error." });
  }
  render();
}

renderToolCatalog();
addActivity({ actor: "Human", action: "Opened the scenario", detail: "A full-budget draft is visible, including the commitments it still misses." });
wireHumanControls();
render();
registerWebMcpTools();

// Exported for zero-dependency browser-adjacent tests and manual console inspection.
export { applyCompromise, evaluateTradeoffs, findCompromise, resetScenario, setAllocation };
