"use strict";

// Shared WaterCRED engine. Each page loads core.js, then a country file that
// builds a config object and calls initApp(config).

const CREDITWORTHY_THRESHOLD = 60;

const factors = [
  { id: "poverty", name: "Poverty rate", category: "context", unit: "%", weight: 3, min: 0, max: 100, step: 0.1, workbook: 30, direction: "lower", score: v => v < 20 ? [4,"0–20%"] : v < 40 ? [3,"20–40%"] : v < 60 ? [2,"40–60%"] : v < 80 ? [1,"60–80%"] : [0,"80–100%"] },
  { id: "sanitation", name: "Sanitation coverage", category: "context", unit: "%", weight: 1, min: 0, max: 100, step: 0.1, workbook: 95, direction: "higher", score: coverageScore },
  { id: "water", name: "Water coverage", category: "context", unit: "%", weight: 1, min: 0, max: 100, step: 0.1, workbook: 75, direction: "higher", score: coverageScore },
  { id: "nrw", name: "Non-revenue water", category: "context", unit: "%", weight: 5, min: 0, max: 80, step: 0.1, workbook: 35, direction: "lower", score: v => v < 20 ? [4,"<20%"] : v < 30 ? [3,"20–30%"] : v < 40 ? [2,"30–40%"] : v <= 50 ? [1,"40–50%"] : [0,">50%"] },
  { id: "staff", name: "Staff / 1,000 connections", category: "context", unit: "staff", weight: 3, min: 0, max: 15, step: 0.1, workbook: 7, direction: "lower", score: v => v < 5 ? [4,"<5"] : v <= 6 ? [3,"5–6"] : v <= 7 ? [2,"6–7"] : v <= 8 ? [1,"7–8"] : [0,">8"] },
  { id: "revenue_diversification", name: "Revenue diversification", category: "context", unit: "%", weight: 5, min: 0, max: 100, step: 0.1, workbook: 75, direction: "lower", score: v => v < 10 ? [4,"<10%"] : v < 30 ? [3,"10–30%"] : v < 50 ? [2,"30–50%"] : v <= 70 ? [1,"50–70%"] : [0,">70%"] },

  { id: "tariff_differential", name: "Average tariff differential", category: "costs", unit: "%", weight: 7, min: -20, max: 100, step: 0.1, workbook: 27.5, direction: "higher", score: v => v > 50 ? [4,">50%"] : v >= 35 ? [3,"35–50%"] : v >= 20 ? [2,"20–35%"] : v >= 5 ? [1,"5–20%"] : [0,"<5%"] },
  { id: "maintenance", name: "Maintenance costs / OPEX", category: "costs", unit: "%", weight: 3, min: 0, max: 20, step: 0.1, workbook: 5, direction: "higher", score: v => v > 8 ? [4,">8%"] : v >= 6 ? [3,"6–8%"] : v >= 4 ? [2,"4–6%"] : v > 0 ? [1,"0–4%"] : [0,"0%"] },
  { id: "electricity", name: "Electricity costs / OPEX", category: "costs", unit: "%", weight: 2, min: 0, max: 50, step: 0.1, workbook: 30, direction: "lower", score: v => v < 10 ? [4,"<10%"] : v < 15 ? [3,"10–15%"] : v < 20 ? [2,"15–20%"] : v <= 25 ? [1,"20–25%"] : [0,">25%"] },
  { id: "employee", name: "Employee costs / OPEX", category: "costs", unit: "%", weight: 2, min: 0, max: 70, step: 0.1, workbook: 37.5, direction: "lower", score: v => v < 25 ? [4,"<25%"] : v < 30 ? [3,"25–30%"] : v < 35 ? [2,"30–35%"] : v <= 40 ? [1,"35–40%"] : [0,">40%"] },
  { id: "om_coverage", name: "O&M coverage", category: "costs", unit: "%", weight: 4, min: 50, max: 180, step: 0.1, workbook: 125, direction: "higher", score: v => v > 130 ? [4,">130%"] : v >= 120 ? [3,"120–130%"] : v >= 110 ? [2,"110–120%"] : v >= 100 ? [1,"100–110%"] : [0,"<100%"] },

  { id: "ebitda", name: "EBITDA / revenue", category: "financial", unit: "%", weight: 5, min: -30, max: 60, step: 0.1, workbook: 5, direction: "higher", score: marginScore },
  { id: "cash_reserves", name: "Cash reserves", category: "financial", unit: "%", weight: 4, min: 0, max: 60, step: 0.1, workbook: 5, direction: "higher", score: marginScore },
  { id: "liquidity", name: "Liquidity ratio", category: "financial", unit: "%*", weight: 6, min: 0, max: 60, step: 0.1, workbook: 5, direction: "higher", score: marginScore },
  { id: "dscr", name: "Debt service coverage ratio", category: "financial", unit: "×", weight: 7, min: 0, max: 3, step: 0.01, workbook: 2, direction: "higher", score: v => v > 1.8 ? [4,">1.8×"] : v >= 1.6 ? [3,"1.6–1.8×"] : v >= 1.4 ? [2,"1.4–1.6×"] : v >= 1.2 ? [1,"1.2–1.4×"] : [0,"<1.2×"] },
  { id: "grant_dependency", name: "Grant dependency", category: "financial", unit: "%", weight: 3, min: 0, max: 50, step: 0.1, workbook: 5, direction: "lower", score: v => v === 0 ? [4,"0%"] : v <= 10 ? [3,"0–10%"] : v <= 15 ? [2,"10–15%"] : v <= 20 ? [1,"15–20%"] : [0,">20%"] },
  { id: "debt_cash", name: "Debt / cash available for debt service", category: "financial", unit: "×", weight: 9, min: 0, max: 10, step: 0.01, workbook: 0.7, direction: "lower", score: v => v < 0.9 ? [4,"<0.9×"] : v < 1.7 ? [3,"0.9–1.7×"] : v < 3.3 ? [2,"1.7–3.3×"] : v <= 6.3 ? [1,"3.3–6.3×"] : [0,">6.3×"] },
  { id: "debt_equity", name: "Debt to equity", category: "financial", unit: "%", weight: 5, min: 0, max: 80, step: 0.1, workbook: 45, direction: "lower", score: v => v < 20 ? [4,"<20%"] : v < 25 ? [3,"20–25%"] : v < 30 ? [2,"25–30%"] : v <= 35 ? [1,"30–35%"] : [0,">35%"] },

  { id: "debtor_days", name: "Debtor days", category: "commercial", unit: "days", weight: 5, min: 0, max: 240, step: 1, workbook: 150, direction: "lower", score: v => v < 45 ? [4,"<45 days"] : v < 60 ? [3,"45–60 days"] : v < 90 ? [2,"60–90 days"] : v <= 120 ? [1,"90–120 days"] : [0,">120 days"] },
  { id: "debtor_reduction", name: "Reduction in debtor days", category: "commercial", unit: "%", weight: 5, min: -30, max: 50, step: 0.1, workbook: 22.5, direction: "higher", score: marginScore },
  { id: "bad_debt", name: "Bad debt provision", category: "commercial", unit: "days", weight: 5, min: 0, max: 500, step: 1, workbook: 75, direction: "lower", score: v => v < 60 ? [4,"<60 days"] : v < 90 ? [3,"60–90 days"] : v < 180 ? [2,"90–180 days"] : v <= 365 ? [1,"180–365 days"] : [0,">365 days"] },
  { id: "billing_efficiency", name: "Billing efficiency", category: "commercial", unit: "%", weight: 5, min: 60, max: 100, step: 0.1, workbook: 97, direction: "higher", score: efficiencyScore },
  { id: "collection_efficiency", name: "Collection efficiency", category: "commercial", unit: "%", weight: 5, min: 60, max: 100, step: 0.1, workbook: 91, direction: "higher", score: efficiencyScore }
];

const factorDefinitions = {
  poverty: "Share of the population living below the poverty line.",
  sanitation: "Share of the population with improved or safely managed sanitation.",
  water: "Share of the population served by piped or safely managed water.",
  nrw: "Share of water produced that is lost or otherwise not billed.",
  staff: "Number of utility staff for every 1,000 customer connections.",
  revenue_diversification: "Share and concentration of revenue earned outside the core residential tariff base.",
  tariff_differential: "Difference between the utility's tariff and its cost benchmark; the workbook labels this as the difference between highest and lowest tariffs.",
  maintenance: "Maintenance expenditure as a percentage of total operating expenditure.",
  electricity: "Electricity expenditure as a percentage of total operating expenditure.",
  employee: "Employee costs, including salaries and benefits, as a percentage of total operating expenditure.",
  om_coverage: "Ability of water and sewerage revenue to cover operating and maintenance expenditure.",
  ebitda: "Cash operating margin: EBITDA as a percentage of total revenue.",
  cash_reserves: "Cash on hand relative to annual operating expenditure or income.",
  liquidity: "Cash and near-cash resources available relative to current liabilities.",
  dscr: "Cash flow available for debt service divided by principal and interest due.",
  grant_dependency: "Share of expenditure or investment financed by grants rather than internally generated funds.",
  debt_cash: "Total debt relative to cash available for servicing that debt.",
  debt_equity: "Total debt divided by total equity, indicating financial leverage.",
  debtor_days: "Average number of days required to collect billed operating revenue.",
  debtor_reduction: "Year-on-year percentage reduction in average debtor days.",
  bad_debt: "Number of overdue days before an invoice is recognized or provided for as bad debt.",
  billing_efficiency: "Percentage of water consumed or produced that is successfully billed.",
  collection_efficiency: "Percentage of billed revenue that is actually collected in cash."
};

function coverageScore(v) {
  return v >= 100 ? [4,"100%"] : v >= 90 ? [3,"90–100%"] : v >= 80 ? [2,"80–90%"] : v >= 70 ? [1,"70–80%"] : [0,"<70%"];
}
function marginScore(v) {
  return v > 25 ? [4,">25%"] : v >= 20 ? [3,"20–25%"] : v >= 15 ? [2,"15–20%"] : v >= 10 ? [1,"10–15%"] : [0,"<10%"];
}
function efficiencyScore(v) {
  return v > 95 ? [4,">95%"] : v >= 93 ? [3,"93–95%"] : v >= 90 ? [2,"90–93%"] : v >= 85 ? [1,"85–90%"] : [0,"<85%"];
}

// Workbook-relative presets shared by every country page.
const workbookPreset = Object.fromEntries(factors.map(f => [f.id, f.workbook]));
const upsidePreset = { poverty: 7.1, sanitation: 100, water: 100, nrw: 18, staff: 4.5, revenue_diversification: 8, tariff_differential: 55, maintenance: 9, electricity: 9, employee: 24, om_coverage: 135, ebitda: 28, cash_reserves: 28, liquidity: 28, dscr: 2, grant_dependency: 0, debt_cash: 0.8, debt_equity: 18, debtor_days: 40, debtor_reduction: 28, bad_debt: 45, billing_efficiency: 97, collection_efficiency: 97 };
const stressPreset = { poverty: 45, sanitation: 82, water: 78, nrw: 52, staff: 9, revenue_diversification: 75, tariff_differential: 3, maintenance: 2, electricity: 28, employee: 44, om_coverage: 92, ebitda: 5, cash_reserves: 5, liquidity: 5, dscr: 1.1, grant_dependency: 25, debt_cash: 7, debt_equity: 42, debtor_days: 140, debtor_reduction: 5, bad_debt: 400, billing_efficiency: 82, collection_efficiency: 82 };

// Minimal RFC-4180 parser. The validated files contain quoted commas.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(r => r.length === headers.length).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function clamp(value) { return Math.max(0, Math.min(100, value)); }
function compact(value) { return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(value); }

function initApp(config) {
  const state = { ...config.presets[config.defaultPreset] };
  const factorGrid = document.querySelector("#factorGrid");

  function formatInput(value, step) {
    const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
    return Number(value).toFixed(decimals);
  }

  function renderFactors() {
    factorGrid.innerHTML = factors.map(f => {
      const [points, bucket] = f.score(state[f.id]);
      const evidenced = config.evidencedIds.has(f.id);
      const source = config.sources[f.id] ?? "Workbook example";
      return `<article class="factor-card" data-category="${f.category}" data-id="${f.id}">
        <div class="factor-head">
          <div>
            <h3 class="factor-title">${f.name}</h3>
            <p class="factor-definition">${factorDefinitions[f.id]}</p>
            <div class="factor-sub"><span>Weight ${f.weight}</span><span class="tag ${evidenced ? "evidenced" : "assumed"}">${evidenced ? "evidenced" : "assumption"}</span></div>
          </div>
          <div class="factor-points"><b data-points>${points}/4</b><span>${points * f.weight} weighted</span></div>
        </div>
        <div class="control-row">
          <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${state[f.id]}" data-control="${f.id}" aria-label="${f.name}">
          <input type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${formatInput(state[f.id], f.step)}" data-number="${f.id}" aria-label="${f.name} numeric value">
        </div>
        <div class="factor-footer"><span>${source}</span><span><span class="bucket" data-bucket>${bucket}</span> · ${f.unit}</span></div>
      </article>`;
    }).join("");

    factorGrid.querySelectorAll("[data-control], [data-number]").forEach(input => {
      input.addEventListener("input", event => updateFactor(event.target.dataset.control || event.target.dataset.number, event.target.value));
    });
  }

  function updateFactor(id, rawValue) {
    const f = factors.find(item => item.id === id);
    const value = Math.max(f.min, Math.min(f.max, Number(rawValue)));
    if (!Number.isFinite(value)) return;
    state[id] = value;
    const card = factorGrid.querySelector(`[data-id="${id}"]`);
    const [points, bucket] = f.score(value);
    card.querySelector("[data-control]").value = value;
    card.querySelector("[data-number]").value = formatInput(value, f.step);
    card.querySelector("[data-points]").innerHTML = `${points}/4`;
    card.querySelector(".factor-points span").textContent = `${points * f.weight} weighted`;
    card.querySelector("[data-bucket]").textContent = bucket;
    updateScore();
  }

  function rating(score) {
    if (score >= 75) return { label: "Creditworthy", color: "#44a892", narrative: "The score indicates a creditworthy profile, subject to evidence quality, forward-looking analysis and lender due diligence." };
    if (score >= CREDITWORTHY_THRESHOLD) return { label: "Potentially creditworthy", color: "#7ea66c", narrative: "The score clears the provisional minimum, but weaknesses, evidence gaps or financing conditions may still constrain borrowing." };
    if (score >= 40) return { label: "Below threshold", color: "#e0a84c", narrative: "The scenario remains below the provisional creditworthiness threshold, with material constraints and unverified financial inputs." };
    return { label: "High concern", color: "#bc624e", narrative: "The simulated profile has substantial weaknesses that would require mitigation before conventional borrowing." };
  }

  function calculateScore() {
    const weighted = factors.reduce((sum, f) => sum + f.score(state[f.id])[0] * f.weight, 0);
    return { weighted, index: weighted / 4 };
  }

  function updateScore() {
    const { weighted, index } = calculateScore();
    const band = rating(index);
    const opportunities = factors.map(f => ({ name: f.name, gain: (4 - f.score(state[f.id])[0]) * f.weight / 4 })).sort((a,b) => b.gain - a.gain || a.name.localeCompare(b.name));

    document.querySelector("#scoreValue").textContent = index.toFixed(1);
    document.querySelector("#weightedPoints").textContent = weighted.toFixed(0);
    document.querySelector("#ratingLabel").textContent = band.label;
    document.querySelector("#scoreNarrative").textContent = band.narrative;
    document.querySelector("#ratingDot").style.background = band.color;
    const thresholdGap = index - CREDITWORTHY_THRESHOLD;
    document.querySelector("#thresholdStatus").textContent = thresholdGap < 0
      ? `${Math.abs(thresholdGap).toFixed(1)} points below`
      : config.evidencedInputs < config.minEvidencedInputs
        ? "score met; evidence insufficient"
        : "threshold and evidence met";
    const ring = document.querySelector("#scoreRing");
    ring.style.setProperty("--score", index);
    ring.style.setProperty("--ring-color", band.color);
    ring.setAttribute("aria-label", `Creditworthiness score ${index.toFixed(1)} out of 100, ${band.label}`);
    document.querySelector("#upsideValue").textContent = `+${opportunities[0].gain.toFixed(1)}`;
    document.querySelector("#upsideLabel").textContent = opportunities[0].name;
    renderImpact(opportunities.slice(0, 7));
  }

  function renderImpact(opportunities) {
    const max = Math.max(...opportunities.map(o => o.gain), 1);
    document.querySelector("#impactList").innerHTML = opportunities.map(o => `<div class="impact-row">
      <span class="impact-label">${o.name}</span>
      <div class="impact-bar"><span style="width:${o.gain / max * 100}%"></span></div>
      <span class="impact-value">+${o.gain.toFixed(1)}</span>
    </div>`).join("");
  }

  function applyPreset(name) {
    Object.assign(state, config.presets[name]);
    renderFactors();
    updateScore();
  }

  document.querySelector("#presetSelect").addEventListener("change", e => applyPreset(e.target.value));
  document.querySelector("#resetButton").addEventListener("click", () => {
    document.querySelector("#presetSelect").value = config.defaultPreset;
    applyPreset(config.defaultPreset);
  });
  document.querySelectorAll(".category-tab").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".category-tab").forEach(b => b.classList.toggle("active", b === button));
    const filter = button.dataset.filter;
    document.querySelectorAll(".factor-card").forEach(card => card.classList.toggle("hidden", filter !== "all" && card.dataset.category !== filter));
  }));

  renderFactors();
  updateScore();

  let observations = [];
  const csvNames = new Map();
  const displayName = id => config.utilityName ? config.utilityName(id) : (csvNames.get(id) || id);

  const helpers = { latestObservation, clamp, utilityName: displayName, observations: () => observations };

  async function loadEvidence() {
    const status = document.querySelector("#dataStatus");
    try {
      const response = await fetch(config.csvPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      observations = parseCSV(await response.text()).map(r => ({ ...r, year: Number(r.year), value: Number(r.value) }));
      if (config.normalizeRow) observations = observations.map(config.normalizeRow);
      observations.forEach(r => { if (r.utility_name && !csvNames.has(r.utility_id)) csvNames.set(r.utility_id, r.utility_name); });
      const utilities = [...new Map(observations.map(r => [r.utility_id, displayName(r.utility_id)])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
      const years = [...new Set(observations.map(r => r.year))].sort((a,b) => b-a);
      document.querySelector("#utilitySelect").insertAdjacentHTML("beforeend", utilities.map(([id,name]) => `<option value="${id}">${name}</option>`).join(""));
      document.querySelector("#yearSelect").innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
      document.querySelector("#yearSelect").value = years.includes(config.defaultYear) ? String(config.defaultYear) : String(years[0]);
      status.textContent = `${observations.length} validated observations loaded · ${years.at(-1)}–${years[0]} · ${utilities.length} utilities`;
      renderEvidence();
    } catch (error) {
      status.className = "data-status error";
      status.textContent = "The evidence explorer could not load the CSV. Start the included local server instead of opening the page directly.";
      document.querySelector("#metricGrid").innerHTML = `<article class="metric-card missing"><span>CSV unavailable</span><strong>—</strong><small>${error.message}</small></article>`;
    }
  }

  function renderEvidence() {
    const utility = document.querySelector("#utilitySelect").value;
    const year = Number(document.querySelector("#yearSelect").value);
    const rows = observations.filter(r => r.year === year && (utility === "ALL" || r.utility_id === utility));
    const values = config.metrics.map(m => ({ ...m, ...aggregateMetric(rows, m) }));
    document.querySelector("#metricGrid").innerHTML = values.map(m => `<article class="metric-card ${m.value == null ? "missing" : ""}">
      <span>${m.label}</span><strong>${m.value == null ? "—" : m.format(m.value)}</strong><small>${m.value == null ? "No observation for selection" : `${m.unit} · n=${m.count}`}</small>
    </article>`).join("");
    const available = values.filter(m => m.value != null).length;
    document.querySelector("#evidenceCoverage").innerHTML = `<strong>${available} of ${config.metrics.length}</strong> context metrics available for ${utility === "ALL" ? config.portfolioLabel : displayName(utility)} in ${year}.`;
    renderRanking(year);
  }

  function renderRanking(year) {
    const utilityIds = [...new Set(observations.map(r => r.utility_id))];
    const results = utilityIds.map(id => config.scoreUtility(id, year, helpers));
    const ranked = results.filter(r => r.ranked).sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));
    const unranked = results.filter(r => !r.ranked).sort((a,b) => a.name.localeCompare(b.name));
    ranked.forEach((row, index) => row.rank = index + 1);
    const rows = [...ranked, ...unranked];
    document.querySelector("#rankingBody").innerHTML = rows.map(row => `<div class="ranking-row ${row.ranked ? "" : "unranked"}" role="row">
      <span class="ranking-rank" role="cell">${row.ranked ? row.rank : "—"}</span>
      <span class="ranking-name" role="cell"><button type="button" data-ranking-utility="${row.id}">${row.name}</button></span>
      <span class="ranking-score" role="cell"><span class="ranking-bar"><span style="width:${row.ranked ? row.score : 0}%"></span></span><b>${row.ranked ? row.score.toFixed(1) : "—"}</b></span>
      <span class="ranking-evidence" role="cell"><b>${row.coverageLabel} · ${row.confidence}</b>${row.yearRange || "Insufficient current data"}</span>
    </div>`).join("");
    document.querySelectorAll("[data-ranking-utility]").forEach(button => button.addEventListener("click", () => {
      document.querySelector("#utilitySelect").value = button.dataset.rankingUtility;
      renderEvidence();
      document.querySelector("#evidence").scrollIntoView({ behavior: "smooth" });
    }));
    if (config.onRanking) config.onRanking(rows, year, () => renderEvidence());
  }

  function latestObservation(utilityId, indicatorId, year, maxAge) {
    return observations
      .filter(r => r.utility_id === utilityId && r.indicator_id === indicatorId && r.year <= year && year - r.year <= maxAge)
      .sort((a,b) => b.year - a.year)[0] || null;
  }

  function aggregateMetric(rows, metric) {
    if (metric.aggregate === "complaintRate") {
      const complaintRows = rows.filter(r => r.indicator_id === "SQ_COMPLAINTS_TOTAL");
      const connectionRows = rows.filter(r => r.indicator_id === "OPS_CONNECTIONS_TOTAL");
      const connections = new Map(connectionRows.map(r => [r.utility_id, r.value]));
      const matched = complaintRows.filter(r => connections.has(r.utility_id));
      const matchedConnections = matched.reduce((sum,r) => sum + connections.get(r.utility_id), 0);
      const complaints = matched.reduce((sum,r) => sum + r.value, 0);
      return matched.length && matchedConnections ? { value: complaints / matchedConnections * 1000, count: matched.length } : { value: null, count: 0 };
    }
    const selected = rows.filter(r => r.indicator_id === metric.id);
    if (!selected.length) return { value: null, count: 0 };
    if (metric.aggregate === "sum") return { value: selected.reduce((sum,r) => sum + r.value, 0), count: selected.length };
    if (selected.length === 1) return { value: selected[0].value, count: 1 };
    const connections = new Map(rows.filter(r => r.indicator_id === "OPS_CONNECTIONS_TOTAL").map(r => [r.utility_id, r.value]));
    const weighted = selected.filter(r => connections.has(r.utility_id));
    if (weighted.length) {
      const totalWeight = weighted.reduce((sum,r) => sum + connections.get(r.utility_id), 0);
      return { value: weighted.reduce((sum,r) => sum + r.value * connections.get(r.utility_id), 0) / totalWeight, count: weighted.length };
    }
    return { value: selected.reduce((sum,r) => sum + r.value, 0) / selected.length, count: selected.length };
  }

  document.querySelector("#utilitySelect").addEventListener("change", renderEvidence);
  document.querySelector("#yearSelect").addEventListener("change", renderEvidence);
  loadEvidence();
}
