import {
  ALLOCATION_STEP,
  BUDGET,
  INITIAL_ALLOCATIONS,
  PROPOSALS,
  createInitialState,
  evaluateScenario,
  findFeasibleCompromise,
  priceOfProtecting,
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
  revisionValue: document.querySelector("#revision-value"),
  decisionRecord: document.querySelector("#decision-record"),
  decisionBody: document.querySelector("#decision-body"),
  decisionRevision: document.querySelector("#decision-revision"),
  commitmentField: document.querySelector("#commitment-field"),
  applyButton: document.querySelector('[data-action="apply"]'),
  protectStatus: document.querySelector("#protect-status"),
  protectResult: document.querySelector("#protect-result"),
  protectTarget: document.querySelector("#protect-target"),
  protectMinimum: document.querySelector("#protect-minimum"),
  protectApply: document.querySelector('[data-action="apply-protection"]'),
};

let state = createInitialState();
let proposedCompromise = null;
// The pending answer to "what would it cost to protect this?".
//
// Deliberately separate from proposedCompromise: a protection swap is
// human-apply-only. No registered tool can commit it, so the agent can put an
// exact price on a commitment without ever being able to pay it.
let pendingProtection = null;
let feedback = "";
let activities = [];
// The decision record. A rejected move must be able to show its exact reason
// AND that the shared revision did not advance -- that is the difference
// between "the app refused" and "the app ignored me".
let lastDecision = null;

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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
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

function recordDecision(kind, message, revisionBefore) {
  lastDecision = {
    kind,
    message,
    revisionBefore,
    revisionAfter: state.revision,
    at: nowStamp(),
  };
}

function renderDecision() {
  if (!lastDecision) {
    dom.decisionRecord.hidden = true;
    return;
  }
  const { kind, message, revisionBefore, revisionAfter, at } = lastDecision;
  dom.decisionRecord.hidden = false;
  dom.decisionRecord.className = `decision-record ${kind}`;
  dom.decisionBody.textContent = message;
  dom.decisionRevision.textContent = revisionBefore === revisionAfter
    ? `${at} · revision ${revisionBefore} unchanged — the shared scenario was not modified.`
    : `${at} · revision ${revisionBefore} → ${revisionAfter} — the shared scenario advanced.`;
}

function renderCommitmentField(evaluation) {
  // Depth only. Every exact figure stays in the table and the readouts; this
  // is the same numbers as proportion, so the eye can see the split at a glance.
  const total = evaluation.total || 1;
  dom.commitmentField.innerHTML = PROPOSALS
    .map((proposal) => {
      const pct = ((evaluation.allocations[proposal.id] || 0) / total) * 100;
      return `<i style="width:${pct.toFixed(2)}%"></i>`;
    })
    .join("");
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
  // Exact currency for the headline total and the over/under label.
  //
  // Compact notation cannot express this product's own granularity. Allocations
  // move in $5,000 steps and the solver searches a $25,000 grid, but compact
  // rounds to $100,000 steps at the millions scale: $1,200,000 and $1,195,000
  // both render "$1.2M", and with maximumFractionDigits:0 both render "$1M".
  // That is not a rounding preference, it is the page failing to show the
  // difference between fully allocated and $5,000 short. Dense table cells and
  // floor chips keep formatCompactMoney, where width is genuinely tight.
  const totalLabel = formatMoney(evaluation.total);
  const budgetText = evaluation.budgetDelta === 0
    ? `${totalLabel} of ${formatMoney(BUDGET)} committed`
    : evaluation.budgetDelta > 0
      ? `${formatMoney(evaluation.budgetDelta)} unallocated`
      : `${formatMoney(Math.abs(evaluation.budgetDelta))} over budget`;
  if (dom.totalValue.textContent !== totalLabel && dom.totalValue.textContent !== "—") {
    dom.totalValue.classList.remove("changed");
    void dom.totalValue.offsetWidth;
    dom.totalValue.classList.add("changed");
  }
  dom.totalValue.textContent = totalLabel;
  dom.revisionValue.textContent = String(state.revision);
  dom.scoreValue.textContent = `${evaluation.score}/100`;
  dom.floorsValue.textContent = `${constraintsMet}/${evaluation.floors.length}`;
  dom.budgetLabel.textContent = budgetText;
  dom.budgetMeter.style.transform = `scaleX(${(percent / 100).toFixed(4)})`;
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
          <strong>${escapeHtml(activity.actor)} · ${escapeHtml(activity.action)}</strong>
          <span>${escapeHtml(activity.detail)}${activity.tool ? ` <code>${escapeHtml(activity.tool)}</code>` : ""} · ${escapeHtml(activity.time)}</span>
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

function renderProtection() {
  if (!pendingProtection) {
    dom.protectStatus.textContent = "Not asked";
    dom.protectResult.hidden = true;
    dom.protectResult.innerHTML = "";
    dom.protectApply.disabled = true;
    return;
  }

  dom.protectResult.hidden = false;

  // A refusal is a result, not an error state. "No allocation protects this"
  // is the most useful sentence this tool can say, so it gets the same
  // prominence as a successful swap.
  if (!pendingProtection.ok) {
    dom.protectStatus.textContent = "No allocation does this";
    dom.protectApply.disabled = true;
    dom.protectResult.className = "protect-result refused";
    // Built as nodes with textContent, not innerHTML. A refusal message is the
    // one string here that can be shaped by tool input, so it never becomes
    // markup even when the model layer already declines to echo that input.
    dom.protectResult.replaceChildren();
    const verdict = document.createElement("p");
    verdict.className = "protect-verdict";
    verdict.textContent = pendingProtection.reason.message;
    const note = document.createElement("p");
    note.className = "protect-note";
    note.textContent =
      "Nothing was changed. This is the honest answer, not a failure — the tool will not offer a near miss as if it protected the commitment.";
    dom.protectResult.append(verdict, note);
    return;
  }

  const {
    proposalName,
    protectedAmount,
    requestedMinimum,
    protectedExceedsRequest,
    changes,
    reductions,
    floors,
    budgetProof,
    feasible,
  } = pendingProtection;

  const losers = reductions.length
    ? reductions.map(({ name, delta }) => `<li><span>${name}</span><strong class="delta-negative">−${formatMoney(Math.abs(delta))}</strong></li>`).join("")
    : `<li><span>Nothing has to fall</span><strong class="delta-positive">${formatMoney(0)}</strong></li>`;

  const movedFloors = floors.map((floor) => {
    const cls = floor.afterMet ? "met" : "failed";
    const floorState = floor.afterMet ? "protected" : `${formatMoney(Math.abs(floor.afterGap))} short`;
    const from = floor.beforeMet ? "was protected" : `was ${formatMoney(Math.abs(floor.beforeGap))} short`;
    return `<li class="${cls}"><span>${floor.label}</span><strong>${formatMoney(floor.after)} — ${floorState}</strong><em>${from}</em></li>`;
  }).join("");

  dom.protectStatus.textContent = "Pending — not applied";
  dom.protectApply.disabled = false;
  dom.protectResult.className = "protect-result pending";
  dom.protectResult.innerHTML = `
    <p class="protect-verdict">
      Protecting <strong>${proposalName}</strong> at ${formatMoney(protectedAmount)}${
        protectedExceedsRequest ? ` (the nearest grid amount at or above your ${formatMoney(requestedMinimum)})` : ""
      } costs this exact swap.
    </p>
    <p class="step-label">What falls to pay for it</p>
    <ul class="protect-losers">${losers}</ul>
    <p class="step-label">Every floor, before and after</p>
    <ul class="protect-floors">${movedFloors}</ul>
    <p class="protect-proof">${budgetProof.statement} Checked ${feasible.toLocaleString()} allocations that hold this commitment.</p>
    <p class="protect-note"><strong>This is a proposal. Nothing has changed yet.</strong> The shared scenario stays at revision ${state.revision} until a person presses Apply.</p>
  `;
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
  renderCommitmentField(evaluation);
  renderDecision();
  renderLog();
  renderCompromise();
  renderProtection();
}

function validateAmount(proposal, amount) {
  if (!Number.isInteger(amount)) return `${proposal.name} needs a whole-dollar amount.`;
  if (amount < proposal.min || amount > proposal.max) {
    return `${proposal.name} must stay between ${formatMoney(proposal.min)} and ${formatMoney(proposal.max)}.`;
  }
  if (amount % ALLOCATION_STEP !== 0) return `${proposal.name} must use ${formatMoney(ALLOCATION_STEP)} increments.`;
  return null;
}

// Human-only write path. There is deliberately no registered tool that reaches
// this function: see previewAllocation for the agent-facing counterpart.
function setAllocation(proposalId, rawAmount, actor = "Human") {
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
    recordDecision("rejected", `Rejected. ${validation}`, state.revision);
    setFeedback(validation);
    addActivity({ actor, action: "Rejected an invalid edit", detail: validation });
    render();
    return result;
  }
  const candidate = { ...state.allocations, [proposalId]: amount };
  const evaluation = evaluateScenario(candidate);
  if (evaluation.total > BUDGET) {
    const overage = evaluation.total - BUDGET;
    const message = `Rejected: that change would break the fixed budget by ${formatMoney(overage)}.`;
    recordDecision("rejected", `${message} ${proposal.name} cannot increase to ${formatMoney(amount)} without removing ${formatMoney(overage)} elsewhere.`, state.revision);
    setFeedback(message);
    addActivity({ actor, action: "Rejected an over-budget move", detail: `${proposal.name} cannot increase to ${formatMoney(amount)} without removing ${formatMoney(overage)} elsewhere.` });
    render();
    return { ok: false, reason: "budget_exceeded", proposalId, amount, overage, evaluation: publicEvaluation(evaluation) };
  }
  const revisionBefore = state.revision;
  state = { allocations: candidate, revision: state.revision + 1 };
  proposedCompromise = null;
  // A priced protection is measured against the allocation it was computed
  // from. Once that moves, its "before" column is a lie, so it is discarded
  // rather than left on screen looking current.
  pendingProtection = null;
  recordDecision("accepted", `Accepted. ${proposal.name} is now ${formatMoney(amount)}.`, revisionBefore);
  setFeedback(`${proposal.name} is now ${formatMoney(amount)}. The shared scenario was updated.`, "ok");
  addActivity({ actor, action: "Updated a commitment", detail: `${proposal.name} is now ${formatMoney(amount)}. The rules engine recalculated every floor.` });
  render();
  return { ok: true, proposalId, amount, evaluation: publicEvaluation() };
}

/**
 * Answer "what would happen if this commitment were set to that amount?"
 * without doing it.
 *
 * This replaced a registered `set_allocation` writer. That tool was read as
 * safe because each individual write was validated, but validation is not a
 * capability boundary: an agent could replay a priced protection by writing the
 * four amounts in reduction-first order, every step in range and under budget,
 * and reach the exact proposed state with no human involved. Removing the
 * arbitrary write is the only thing that actually closes that, so the agent
 * gets the same truthful answer -- including the exact over-budget refusal --
 * and none of the reach.
 */
function previewAllocation(proposalId, rawAmount, actor = "Agent", tool = "preview_allocation") {
  const proposal = proposalById.get(proposalId);
  const amount = Number(rawAmount);
  const revisionBefore = state.revision;

  if (!proposal) {
    const message = "That commitment is not part of this scenario.";
    recordDecision("rejected", `Preview rejected. ${message}`, revisionBefore);
    setFeedback(message);
    addActivity({ actor, action: "Previewed an unknown commitment", detail: message, tool });
    render();
    return { ok: false, preview: true, reason: "unknown_proposal", proposalId, message };
  }

  const validation = validateAmount(proposal, amount);
  if (validation) {
    recordDecision("rejected", `Preview rejected. ${validation}`, revisionBefore);
    setFeedback(validation);
    addActivity({ actor, action: "Previewed an invalid edit", detail: `${validation} Nothing changed.`, tool });
    render();
    return { ok: false, preview: true, reason: "invalid_amount", proposalId, amount, message: validation };
  }

  const candidate = { ...state.allocations, [proposalId]: amount };
  const evaluation = evaluateScenario(candidate);

  if (evaluation.total > BUDGET) {
    const overage = evaluation.total - BUDGET;
    const message = `${proposal.name} cannot increase to ${formatMoney(amount)} without removing ${formatMoney(overage)} elsewhere.`;
    recordDecision("rejected", `Preview rejected: that change would break the fixed budget by ${formatMoney(overage)}. ${message}`, revisionBefore);
    setFeedback(`That change would break the fixed budget by ${formatMoney(overage)}.`);
    addActivity({ actor, action: "Previewed an over-budget move", detail: `${message} Nothing changed.`, tool });
    render();
    return {
      ok: false, preview: true, reason: "budget_exceeded",
      proposalId, amount, overage, budget: BUDGET, total: evaluation.total, message,
    };
  }

  const message = `${proposal.name} at ${formatMoney(amount)} would be accepted. A person still has to make the change.`;
  recordDecision("pending", `Preview only. ${message}`, revisionBefore);
  setFeedback(message);
  addActivity({
    actor,
    action: "Previewed a commitment change",
    detail: `${message} Revision ${revisionBefore} is unchanged.`,
    tool,
  });
  render();
  return {
    ok: true, preview: true, applied: false,
    proposalId, amount,
    note: "Preview only. This tool cannot change the shared scenario; a person must make the change in the interface.",
    wouldBecome: publicEvaluation(evaluation),
    current: publicEvaluation(),
  };
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
    recordDecision("rejected", "No proposal. No candidate met every hard constraint on the configured grid.", state.revision);
    setFeedback("No feasible compromise exists on the configured grid.");
    addActivity({ actor, action: "Could not find a compromise", detail: "No candidate met the hard constraints on the configured grid.", tool });
    render();
    return { ok: false, reason: "no_feasible_compromise" };
  }
  const { evaluation, considered, deltas } = proposedCompromise;
  const revisionBefore = state.revision;
  recordDecision(
    "pending",
    `Feasible proposal ready: ${formatMoney(evaluation.total)} committed and ${evaluation.floors.length}/${evaluation.floors.length} floors protected. Human action is required; nothing was applied.`,
    revisionBefore,
  );
  setFeedback("Feasible proposal ready. Review the exact deltas, then a person may apply it.");
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

function applyCompromise() {
  if (!proposedCompromise) {
    const message = "There is no pending compromise. Find one before applying it.";
    recordDecision("rejected", `Rejected. ${message}`, state.revision);
    setFeedback(message);
    addActivity({ actor: "Human", action: "Could not apply a compromise", detail: message });
    render();
    return { ok: false, reason: "no_pending_compromise", message };
  }
  const revisionBefore = state.revision;
  state = { allocations: { ...proposedCompromise.allocations }, revision: state.revision + 1 };
  const evaluation = evaluateScenario(state.allocations);
  const floorsMet = evaluation.floors.filter((floor) => floor.met).length;
  recordDecision(
    "accepted",
    `Human accepted the reviewed compromise. ${formatMoney(evaluation.total)} committed, ${floorsMet}/${evaluation.floors.length} floors protected.`,
    revisionBefore,
  );
  setFeedback("Compromise applied. The new allocation is feasible and every floor is protected.", "ok");
  addActivity({ actor: "Human", action: "Applied the shared compromise", detail: `The live scenario is now feasible: ${formatMoney(evaluation.total)} committed, ${evaluation.floors.length}/${evaluation.floors.length} floors protected.` });
  proposedCompromise = null;
  pendingProtection = null;
  render();
  return { ok: true, evaluation: publicEvaluation(evaluation) };
}

function askPriceOfProtecting(proposalId, rawMinimum, actor = "Human", tool = null) {
  const atLeast = Number(rawMinimum);
  const proposal = proposalById.get(proposalId);
  // A valid tool request becomes the visible request before its answer is
  // rendered. The selector, amount, result, and activity trail therefore
  // cannot describe four different conversations.
  if (proposal && !validateAmount(proposal, atLeast)) {
    dom.protectTarget.value = proposalId;
    dom.protectMinimum.min = String(proposal.min);
    dom.protectMinimum.max = String(proposal.max);
    dom.protectMinimum.step = String(ALLOCATION_STEP);
    dom.protectMinimum.value = String(atLeast);
  }
  const result = priceOfProtecting(state.allocations, { proposalId, atLeast });
  pendingProtection = result;
  const revisionBefore = state.revision;

  if (!result.ok) {
    recordDecision("rejected", `No proposal. ${result.reason.message}`, revisionBefore);
    setFeedback(result.reason.message);
    addActivity({
      actor,
      action: "Asked what protecting a commitment would cost",
      detail: `${result.reason.message} The shared scenario was not touched.`,
      tool,
    });
    render();
    return result;
  }

  const cost = result.reductions.length
    ? result.reductions.map(({ name, delta }) => `${name} −${formatMoney(Math.abs(delta))}`).join(", ")
    : "nothing has to fall";
  const message = `Protecting ${result.proposalName} at ${formatMoney(result.protectedAmount)} would cost: ${cost}.`;
  // A priced proposal is explicitly NOT an accepted decision. The record shows
  // the revision standing still, which is the whole point of the tool.
  recordDecision("pending", `${message} Pending human review — nothing applied.`, revisionBefore);
  setFeedback(`${message} Review it, then apply if the group agrees.`);
  addActivity({
    actor,
    action: "Priced a protected commitment",
    detail: `${message} Revision ${revisionBefore} is unchanged until a person applies it.`,
    tool,
  });
  render();
  return result;
}

function applyProtection() {
  if (!pendingProtection?.ok) {
    const message = "There is no priced proposal to apply. Ask what protecting a commitment costs first.";
    recordDecision("rejected", `Rejected. ${message}`, state.revision);
    setFeedback(message);
    addActivity({ actor: "Human", action: "Could not apply a protection", detail: message });
    render();
    return { ok: false, reason: "no_pending_protection", message };
  }
  const applied = pendingProtection;
  const revisionBefore = state.revision;
  state = { allocations: { ...applied.allocations }, revision: state.revision + 1 };
  const evaluation = evaluateScenario(state.allocations);
  const floorsMet = evaluation.floors.filter((floor) => floor.met).length;
  recordDecision(
    "accepted",
    `Human accepted the reviewed swap. ${applied.proposalName} is protected at ${formatMoney(applied.protectedAmount)}; ${formatMoney(evaluation.total)} committed, ${floorsMet}/${evaluation.floors.length} floors protected.`,
    revisionBefore,
  );
  setFeedback(`${applied.proposalName} is protected at ${formatMoney(applied.protectedAmount)}. A person applied this, not the agent.`, "ok");
  addActivity({
    actor: "Human",
    action: "Applied a protected commitment",
    detail: `${applied.proposalName} held at ${formatMoney(applied.protectedAmount)}; revision ${revisionBefore} → ${state.revision}.`,
  });
  pendingProtection = null;
  proposedCompromise = null;
  render();
  return { ok: true, evaluation: publicEvaluation(evaluation) };
}

function resetScenario() {
  const revisionBefore = state.revision;
  state = { allocations: { ...INITIAL_ALLOCATIONS }, revision: revisionBefore + 1 };
  proposedCompromise = null;
  pendingProtection = null;
  recordDecision(
    "accepted",
    "Human restored the opening draft. The allocation returned to its original priorities without erasing revision history.",
    revisionBefore,
  );
  setFeedback(`Restored the original human draft at revision ${state.revision}.`, "ok");
  addActivity({ actor: "Human", action: "Restored the human draft", detail: `The opening priorities are back; revision ${revisionBefore} → ${state.revision}.` });
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
      addActivity({ actor: "Agent", action: "Read the shared scenario", detail: `Observed ${formatMoney(result.total)} and ${result.constraintsMet}/${result.constraintsTotal} protected floors.`, tool: "get_scenario_state" });
      render();
      return safeResult(result);
    },
  },
  {
    name: "preview_allocation",
    title: "Preview one community commitment change",
    description: "Ask what a single proposal allocation would do at a given amount, in $5,000 increments. Returns the exact refusal for an invalid amount or one that would exceed the fixed budget, or the evaluation the scenario would have. Never changes the shared scenario: only a person can move a commitment.",
    schemaLabel: "input: { proposalId, amount } · output: what would happen · never mutates",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: { type: "string", enum: PROPOSALS.map(({ id }) => id), description: "Commitment to ask about." },
        amount: { type: "integer", minimum: 0, description: "Whole-dollar allocation in $5,000 increments." },
      },
      required: ["proposalId", "amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async ({ proposalId, amount }) => safeResult(previewAllocation(proposalId, amount)),
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
    name: "price_of_protecting",
    title: "Price what it costs to protect one commitment",
    description:
      "Answer \"what would it cost to protect this?\" for a single commitment held at or above a stated minimum. Returns the exact swap -- which commitments fall and by how much, every stakeholder floor before and after, and proof the fixed budget still balances -- or an honest refusal when no allocation on the shared grid can do it. Never returns a near miss as a success, and never changes the shared scenario: applying the swap is a separate human action.",
    schemaLabel: "input: { proposalId, atLeast } · output: exact swap or honest refusal · never mutates",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: {
          type: "string",
          enum: PROPOSALS.map(({ id }) => id),
          description: "The commitment a person wants to protect.",
        },
        atLeast: {
          type: "integer",
          description: "The minimum this commitment must keep, in whole dollars at $5,000 increments.",
        },
      },
      required: ["proposalId", "atLeast"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async ({ proposalId, atLeast }) =>
      safeResult(askPriceOfProtecting(proposalId, atLeast, "Agent", "price_of_protecting")),
  },
];

function syncProtectRange() {
  const proposal = proposalById.get(dom.protectTarget.value);
  if (!proposal) return;
  dom.protectMinimum.min = String(proposal.min);
  dom.protectMinimum.max = String(proposal.max);
  const current = Number(dom.protectMinimum.value);
  if (!Number.isInteger(current) || current < proposal.min || current > proposal.max) {
    dom.protectMinimum.value = String(state.allocations[proposal.id]);
  }
}

function wireHumanControls() {
  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const { action } = actionButton.dataset;
      if (action === "find") findCompromise();
      if (action === "apply") applyCompromise();
      if (action === "reset") resetScenario();
      if (action === "stress") setAllocation("night-routes", 450_000, "Human");
      if (action === "ask-protection") {
        askPriceOfProtecting(dom.protectTarget.value, dom.protectMinimum.value, "Human", "price_of_protecting");
      }
      if (action === "apply-protection") applyProtection();
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
    if (event.target === dom.protectTarget) {
      syncProtectRange();
      return;
    }
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
syncProtectRange();
render();
registerWebMcpTools();

// Exported for zero-dependency browser-adjacent tests and manual console inspection.
function getAppSnapshot() {
  return {
    revision: state.revision,
    allocations: { ...state.allocations },
    hasPendingCompromise: Boolean(proposedCompromise),
    hasPendingProtection: Boolean(pendingProtection?.ok),
  };
}

export { applyCompromise, applyProtection, askPriceOfProtecting, evaluateTradeoffs, findCompromise, getAppSnapshot, previewAllocation, resetScenario, setAllocation };
