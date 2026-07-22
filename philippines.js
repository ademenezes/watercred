"use strict";

// WaterCRED · Philippines — standalone ranking + province map + methodology app.
// Loads core.js (shared 23-factor model, parseCSV, compact) and phl-geo.js
// (province polygons + utility→province mapping), then renders everything here.
// The Georgia engine (core.js initApp) is intentionally left untouched.

(() => {
  const MIN_RANKED_FACTORS = 4;   // ≥4 evidenced factors required to rank
  // No age limit on evidence: each factor uses the latest observation up to the
  // selected year, however old. The data year is disclosed per factor.
  const DEFAULT_YEAR = 2025;
  const MIN_YEAR = 2012;          // earlier years are near-empty in the dataset

  // Manila Water reports some statements in PHP million / million m³; normalize
  // at load so sums and derived ratios never mix magnitudes.
  const normalizeRow = row => {
    if (row.unit === "PHP million") return { ...row, value: row.value * 1e6, unit: "PHP" };
    if (row.unit === "million m3") return { ...row, value: row.value * 1e6, unit: "m3" };
    return row;
  };

  const factorById = Object.fromEntries(factors.map(f => [f.id, f]));

  // ---- Ranking scorer (renormalized subset of the 23-factor workbook model) ---

  // The workbook scores liquidity with EBITDA-style % bands despite defining it
  // as a ratio (a documented workbook ambiguity). FIN_CURRENT_LIQUIDITY is a
  // current ratio, so the ranking uses dedicated ratio bands instead.
  const currentRatioScore = v => v >= 2 ? [4,"≥2.0×"] : v >= 1.5 ? [3,"1.5–2.0×"] : v >= 1.2 ? [2,"1.2–1.5×"] : v >= 1 ? [1,"1.0–1.2×"] : [0,"<1.0×"];

  const SOURCE_SHORT = {
    "COA (Commission on Audit)": "COA",
    "LWUA / water districts": "LWUA",
    "LWUA (Local Water Utilities Administration) via DAP RBPMS": "LWUA · DAP RBPMS",
    "Manila Water Company": "Manila Water"
  };
  const shortInstitution = s => SOURCE_SHORT[s] ?? s;
  const sourceOf = row => ({ institution: row.source_institution, indicator: row.indicator_id, year: row.year, verification: row.verification_level });

  // Latest year ≤ selected year at which every required indicator has an
  // observation — derived ratios never mix statement years.
  // `urows` is the utility's own observations (pre-indexed for speed).
  function latestConsistentSet(urows, requiredIds, optionalIds, year) {
    const candidateYears = [...new Set(urows.filter(r => r.year <= year).map(r => r.year))].sort((a, b) => b - a);
    for (const y of candidateYears) {
      const rows = new Map();
      urows.forEach(r => {
        if (r.year === y && !rows.has(r.indicator_id)
          && (requiredIds.includes(r.indicator_id) || optionalIds.includes(r.indicator_id))) {
          rows.set(r.indicator_id, r);
        }
      });
      if (requiredIds.every(id => rows.has(id))) {
        return { values: new Map([...rows].map(([id, r]) => [id, r.value])), rows, year: y };
      }
    }
    return null;
  }

  const setSources = set => [...set.rows.values()].map(sourceOf);

  const direct = indicatorId => (utilityId, year, helpers) => {
    const observation = helpers.latestObservation(utilityId, indicatorId, year);
    return observation ? { value: observation.value, years: [observation.year], sources: [sourceOf(observation)], inputs: [observation] } : null;
  };

  function ebitdaMargin(utilityId, year, helpers) {
    const reported = direct("FIN_EBITDA_MARGIN")(utilityId, year, helpers);
    if (reported) return reported;
    const set = latestConsistentSet(helpers.utilityObs(utilityId),
      ["FIN_NET_INCOME", "FIN_DEPRECIATION", "FIN_INTEREST_EXPENSE", "FIN_REVENUE"], ["FIN_NONOP_INCOME"], year);
    if (!set) return null;
    const revenue = set.values.get("FIN_REVENUE");
    if (revenue <= 0) return null;
    const ebitda = set.values.get("FIN_NET_INCOME") + set.values.get("FIN_DEPRECIATION")
      + set.values.get("FIN_INTEREST_EXPENSE") - (set.values.get("FIN_NONOP_INCOME") ?? 0);
    return { value: ebitda / revenue * 100, years: [set.year], sources: setSources(set), inputs: [...set.rows.values()], derived: "same-year statements" };
  }

  function debtEquity(utilityId, year, helpers) {
    // FIN_DEBT_TO_EQUITY in the CSV is a bare ratio (e.g. 0.45), which the
    // workbook's percentage bands would misread — so derive the % explicitly.
    const set = latestConsistentSet(helpers.utilityObs(utilityId), ["FIN_TOTAL_LIABILITIES", "FIN_EQUITY"], [], year);
    if (!set) return null;
    const equity = set.values.get("FIN_EQUITY");
    // Negative or zero equity: leverage is worse than any workbook band — score 0 directly.
    if (equity <= 0) return { points: 0, years: [set.year], sources: setSources(set), inputs: [...set.rows.values()], note: "negative equity — worst band by demo convention" };
    return { value: set.values.get("FIN_TOTAL_LIABILITIES") / equity * 100, years: [set.year], sources: setSources(set), inputs: [...set.rows.values()], derived: "same-year statements" };
  }

  // Staffing/connection plausibility guard (documented demo convention): a few
  // source rows misfile peso amounts or the report year as headcounts (Tiaong
  // 2021 "8,747,272 employees"; Digos 2018–20; Metro Roxas/Penablanca/Reina
  // Mercedes report the year itself), and one connection count is fractional
  // (Bayugan 2019). Scoring and size classification skip such observations —
  // no substitute value is invented; the raw dataset table still shows every
  // row as published.
  const MAX_PLAUSIBLE_EMPLOYEES = 5000;      // largest real count nationally: Manila Water ~2,663
  const MAX_PLAUSIBLE_CONN_PER_STAFF = 800;  // largest credible reported value: ~383
  const plausibleEmployees = r => Number.isInteger(r.value) && r.value > 0 && r.value <= MAX_PLAUSIBLE_EMPLOYEES && r.value !== r.year;
  const PLAUSIBILITY = {
    INST_TOTAL_EMPLOYEES: plausibleEmployees,
    INST_PERMANENT_EMPLOYEES: plausibleEmployees,
    INST_PRODUCTIVITY_CONN_PER_STAFF: r => r.value > 0 && r.value <= MAX_PLAUSIBLE_CONN_PER_STAFF,
    OPS_CONNECTIONS_TOTAL: r => Number.isInteger(r.value)
  };
  const plausibleRow = r => (PLAUSIBILITY[r.indicator_id] ?? (() => true))(r);

  function staffPerThousand(utilityId, year, helpers) {
    const uobs = helpers.utilityObs(utilityId).filter(plausibleRow);
    for (const employeeId of ["INST_TOTAL_EMPLOYEES", "INST_PERMANENT_EMPLOYEES"]) {
      const set = latestConsistentSet(uobs, [employeeId, "OPS_CONNECTIONS_TOTAL"], [], year);
      if (set && set.values.get("OPS_CONNECTIONS_TOTAL") > 0) {
        return { value: set.values.get(employeeId) / set.values.get("OPS_CONNECTIONS_TOTAL") * 1000, years: [set.year], sources: setSources(set), inputs: [...set.rows.values()], derived: "employees ÷ connections" };
      }
    }
    const set = latestConsistentSet(uobs, ["INST_PRODUCTIVITY_CONN_PER_STAFF"], [], year);
    const connPerStaff = set?.values.get("INST_PRODUCTIVITY_CONN_PER_STAFF");
    if (connPerStaff > 0) return { value: 1000 / connPerStaff, years: [set.year], sources: setSources(set), inputs: [...set.rows.values()], derived: "1,000 ÷ connections per staff" };
    return null;
  }

  const pct1 = v => `${v.toFixed(1)}%`;
  const phlFactorInputs = [
    { factorId: "om_coverage", compute: direct("FIN_COST_COVERAGE"), kind: "Financial", format: pct1 },
    { factorId: "collection_efficiency", compute: direct("FIN_COLLECTION_EFFICIENCY"), kind: "Commercial", format: pct1 },
    { factorId: "nrw", compute: direct("OPS_NRW_PCT"), kind: "Technical / operational", format: pct1 },
    { factorId: "electricity", compute: direct("FIN_ENERGY_COST_SHARE"), kind: "Financial", format: pct1 },
    { factorId: "employee", compute: direct("FIN_STAFF_COST_SHARE"), kind: "Financial", format: pct1 },
    { factorId: "liquidity", compute: direct("FIN_CURRENT_LIQUIDITY"), score: currentRatioScore, kind: "Financial", format: v => `${v.toFixed(2)}×`, unitNote: "current ratio, demo bands" },
    { factorId: "ebitda", compute: ebitdaMargin, kind: "Financial", format: pct1 },
    { factorId: "debt_equity", compute: debtEquity, kind: "Financial", format: pct1 },
    { factorId: "debt_cash", compute: direct("FIN_DEBT_TO_CADS"), kind: "Financial", format: v => `${v.toFixed(2)}×` },
    { factorId: "dscr", compute: direct("FIN_DSCR"), kind: "Financial", format: v => `${v.toFixed(2)}×` },
    { factorId: "cash_reserves", compute: direct("FIN_CASH_SUFFICIENCY"), kind: "Financial", format: pct1, unitNote: "cash ÷ OPEX, workbook % bands" },
    { factorId: "debtor_days", compute: direct("FIN_ACCOUNTS_RECEIVABLE"), kind: "Commercial", format: v => `${v.toFixed(0)} days` },
    { factorId: "staff", compute: staffPerThousand, kind: "Technical / operational", format: v => `${v.toFixed(1)} / 1,000 conn` }
  ];
  const ELIGIBLE_IDS = new Set(phlFactorInputs.map(e => e.factorId));

  // Renormalized creditworthiness indication: score the factors the utility's
  // validated data supports with the workbook's 0–4 bands, then
  // score = Σ(points × weight) / Σ(4 × weight) × 100 over available factors.
  function scoreUtilityCredit(utilityId, year, helpers) {
    let points = 0, maxPoints = 0, available = 0;
    const years = [];
    const details = phlFactorInputs.map(entry => {
      const factor = factorById[entry.factorId];
      const result = entry.compute(utilityId, year, helpers);
      if (!result) return { factorId: entry.factorId, name: factor.name, weight: factor.weight, available: false };
      const hasValue = result.value != null;
      const [factorPoints, band] = hasValue ? (entry.score ?? factor.score)(result.value) : [result.points, result.note];
      points += factorPoints * factor.weight;
      maxPoints += 4 * factor.weight;
      available++;
      years.push(...result.years);
      const institutions = [...new Set(result.sources.map(s => shortInstitution(s.institution)))];
      return {
        factorId: entry.factorId, name: factor.name, weight: factor.weight, available: true,
        value: hasValue ? result.value : null,
        formatted: hasValue ? entry.format(result.value) : "—",
        inputs: (result.inputs ?? []).map(o => ({ id: o.indicator_id, name: o.indicator_name || o.indicator_id,
          value: o.value, unit: o.unit, year: o.year, institution: shortInstitution(o.source_institution) })),
        points: factorPoints, band, weighted: factorPoints * factor.weight,
        years: [...new Set(result.years)], institutions,
        sourceLabel: institutions.join(" + ")
          + (result.sources.every(s => s.verification === "3_verified") ? " · verified" : "")
          + (result.derived ? ` · derived (${result.derived})` : ""),
        unitNote: entry.unitNote
      };
    });
    const score = maxPoints ? points / maxPoints * 100 : 0;
    const ranked = available >= MIN_RANKED_FACTORS;
    const uniqueYears = [...new Set(years)].sort((a,b) => a-b);
    const yearRange = uniqueYears.length ? (uniqueYears.length === 1 ? `Data year ${uniqueYears[0]}` : `Data years ${uniqueYears[0]}–${uniqueYears.at(-1)}`) : "";
    const confidence = available >= 10 ? "High coverage" : available >= 7 ? "Medium coverage" : available >= MIN_RANKED_FACTORS ? "Low coverage" : "Unranked";
    const detailNote = ranked
      ? `Scored on ${available} of ${phlFactorInputs.length} evidence-eligible factors (of the 23-factor model): ${points} ÷ ${maxPoints} weighted points × 100 = ${score.toFixed(1)}.`
      : `${available} evidenced factor${available === 1 ? "" : "s"} — needs ${MIN_RANKED_FACTORS - available} more to rank. Available evidence is shown below.`;
    return { id: utilityId, name: helpers.utilityName(utilityId), score, available, ranked, yearRange, confidence,
      coverageLabel: `${available}/23 factors`, factors: details, weightedPoints: points, maxWeightedPoints: maxPoints, detailNote };
  }

  // ---- LWUA size classification -------------------------------------------
  // Official Local Water District categories (DBM/LWUA Revised Manual on
  // Categorization, 2011) by number of active service connections. We use the
  // median of a utility's reported connection counts up to the selected year,
  // which dampens single-year reporting spikes; utilities without any connection
  // observation are "Size unknown".
  const SIZE_BANDS = [
    { key: "A", name: "Very large", min: 30000, range: "≥ 30,000 connections" },
    { key: "B", name: "Large", min: 10000, range: "10,000–29,999" },
    { key: "C", name: "Medium", min: 3000, range: "3,000–9,999" },
    { key: "D", name: "Small", min: 0, range: "< 3,000" }
  ];
  function median(sorted) {
    const n = sorted.length;
    return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  }
  function sizeCategory(utilityId, year) {
    const vals = (obsByUtil.get(utilityId) ?? [])
      .filter(r => r.indicator_id === "OPS_CONNECTIONS_TOTAL" && r.year <= year && Number.isFinite(r.value) && plausibleRow(r))
      .map(r => r.value).sort((a,b) => a - b);
    if (!vals.length) return null;
    const m = median(vals);
    const band = SIZE_BANDS.find(b => m >= b.min);
    return { ...band, connections: m };
  }

  // ---- Rating bands (shared by ranking + choropleth) ----------------------
  const RATING_BANDS = [
    { min: 75, label: "Creditworthy (75–100)", color: "#44a892" },
    { min: 60, label: "Potentially creditworthy (60–74)", color: "#7ea66c" },
    { min: 40, label: "Below threshold (40–59)", color: "#e0a84c" },
    { min: 0, label: "High concern (0–39)", color: "#bc624e" }
  ];
  const NO_DATA_COLOR = "#8fa2a4";
  const bandForScore = s => RATING_BANDS.find(b => s >= b.min);

  // ---- Province choropleth -------------------------------------------------
  const PROV_BOUNDS = { minLon: 116.8, maxLon: 126.7, minLat: 4.4, maxLat: 21.0, pad: 12, height: 900 };
  PROV_BOUNDS.scale = (PROV_BOUNDS.height - 2 * PROV_BOUNDS.pad) / (PROV_BOUNDS.maxLat - PROV_BOUNDS.minLat);
  PROV_BOUNDS.lonScale = PROV_BOUNDS.scale * Math.cos((PROV_BOUNDS.minLat + PROV_BOUNDS.maxLat) / 2 * Math.PI / 180);
  PROV_BOUNDS.width = Math.round((PROV_BOUNDS.maxLon - PROV_BOUNDS.minLon) * PROV_BOUNDS.lonScale + 2 * PROV_BOUNDS.pad);
  const project = (lat, lon) => [
    PROV_BOUNDS.pad + (lon - PROV_BOUNDS.minLon) * PROV_BOUNDS.lonScale,
    PROV_BOUNDS.pad + (PROV_BOUNDS.maxLat - lat) * PROV_BOUNDS.scale
  ];
  const provincePaths = {};
  const provincePath = id => provincePaths[id] ??= PHL_PROVINCES[id].map(ring =>
    `M${ring.map(([lon, lat]) => project(lat, lon).map(v => v.toFixed(1)).join(",")).join("L")}Z`).join("");
  const provincesWithUtilities = new Set(Object.values(PHL_UTILITY_GEO));

  // ---- App state -----------------------------------------------------------
  let observations = [];
  const obsByUtil = new Map();          // utility_id -> its own observation rows
  const csvNames = new Map();
  const utilityName = id => csvNames.get(id) || id;
  function latestObservation(utilityId, indicatorId, year) {
    return (obsByUtil.get(utilityId) ?? [])
      .filter(r => r.indicator_id === indicatorId && r.year <= year)
      .sort((a,b) => b.year - a.year)[0] || null;
  }
  const helpers = { latestObservation, clamp, utilityName, observations: () => observations, utilityObs: id => obsByUtil.get(id) ?? [] };

  // Multi-select filters: an empty Set means "no filter" (all pass).
  const state = { year: DEFAULT_YEAR, sizes: new Set(), regions: new Set(), provinces: new Set(), search: "", indicators: new Set() };
  const resultCache = new Map();

  function resultsFor(year) {
    if (resultCache.has(year)) return resultCache.get(year);
    const ids = [...new Set(observations.map(r => r.utility_id))];
    const results = ids.map(id => {
      const r = scoreUtilityCredit(id, year, helpers);
      r.province = PHL_UTILITY_GEO[id] ?? null;
      r.provinceName = r.province ? (PHL_PROVINCE_META[r.province]?.name ?? r.province) : null;
      r.region = r.province ? (PHL_PROVINCE_META[r.province]?.region ?? "") : "";
      r.size = sizeCategory(id, year);
      return r;
    });
    const ranked = results.filter(r => r.ranked).sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));
    ranked.forEach((r, i) => r.rank = i + 1);
    resultCache.set(year, results);
    return results;
  }

  const sizeOK = r => !state.sizes.size || (r.size ? state.sizes.has(r.size.key) : state.sizes.has("unknown"));
  const regionOK = r => !state.regions.size || state.regions.has(r.region);
  const provinceOK = r => !state.provinces.size || state.provinces.has(r.province);
  const searchOK = r => !state.search
    || [r.name, r.id, r.provinceName, r.region].some(s => s && s.toLowerCase().includes(state.search));
  // Indicator filter: utility must have evidence for EVERY selected factor.
  const indicatorsOK = r => !state.indicators.size
    || [...state.indicators].every(id => r.factors.find(f => f.factorId === id)?.available);

  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Human formatting for a raw observation value, by its CSV unit.
  const formatObsValue = o => {
    if (!Number.isFinite(o.value)) return "—";
    if (o.unit === "PHP") return `₱${compact(o.value)}`;
    if (o.unit === "%") return `${o.value.toFixed(1)}%`;
    if (o.unit === "m3") return `${compact(o.value)} m³`;
    if (o.unit === "days") return `${o.value.toFixed(0)} days`;
    return Number.isInteger(o.value) ? o.value.toLocaleString() : o.value.toFixed(2);
  };

  // Absolute statement lines shown in each breakdown for context. Deliberately
  // NOT part of the score — high-coverage figures for judging financial health.
  const KEY_FINANCIALS = [
    { id: "FIN_REVENUE", label: "Total operating revenue" },
    { id: "FIN_OPEX_TOTAL", label: "Total operating expenses" },
    { id: "FIN_NET_INCOME", label: "Net income (loss)" },
    { id: "FIN_OPERATING_CASHFLOW", label: "Net operating cash flow" },
    { id: "FIN_TOTAL_ASSETS", label: "Total assets" }
  ];

  // Per-utility factor breakdown shown inside each expandable ranking row
  // (evidenced factors only).
  function renderFactorBreakdown(row) {
    const body = row.factors.filter(f => f.available).map(f =>
      `<tr><td>${f.name}${f.unitNote ? ` <small>(${esc(f.unitNote)})</small>` : ""}</td>
          <td>${esc(f.formatted)}</td>
          <td><b>${f.points}/4</b> <small>${esc(f.band)}</small></td>
          <td>${f.weight}</td><td>${f.weighted}</td>
          <td>${f.years.join(", ")}</td><td>${esc(f.sourceLabel)}</td></tr>`).join("");
    const keyFin = KEY_FINANCIALS.map(k => {
      const o = latestObservation(row.id, k.id, state.year);
      return o && Number.isFinite(o.value)
        ? `<div><span>${k.label}</span><b>${formatObsValue(o)}</b><small>${o.year} · ${esc(shortInstitution(o.source_institution))}</small></div>`
        : "";
    }).join("");
    return `<div class="factor-breakdown">
      <p class="factor-breakdown-note">${esc(row.detailNote ?? "")}</p>
      ${keyFin ? `<div class="key-financials"><h4>Key financials <small>latest reported · context only, not scored</small></h4><div class="key-financials-grid">${keyFin}</div></div>` : ""}
      <div class="factor-table-wrap"><table class="factor-table">
        <thead><tr><th>Factor</th><th>Value</th><th>Band points</th><th>Weight</th><th>Weighted</th><th>Data year</th><th>Source</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </div>`;
  }

  function renderRanking(list) {
    const rows = list.filter(r => r.ranked).sort((a,b) => a.rank - b.rank);
    const totalRanked = resultsFor(state.year).filter(r => r.ranked).length;
    document.querySelector("#rankingCount").textContent =
      `${rows.length} ranked utilit${rows.length === 1 ? "y" : "ies"}${rows.length !== totalRanked ? ` of ${totalRanked} nationally` : ""}`;
    const openIds = new Set([...document.querySelectorAll(".ranking-details[open]")].map(d => d.dataset.utility));
    if (!rows.length) {
      document.querySelector("#rankingBody").innerHTML = `<div class="ranking-empty">No ranked utilities match the current filters.</div>`;
      return;
    }
    document.querySelector("#rankingBody").innerHTML = rows.map(row => {
      const sizeTag = row.size
        ? `${row.size.name} <span class="size-chip">${row.size.key}</span> · ${Math.round(row.size.connections).toLocaleString()} conn`
        : `<span class="size-chip unknown">size n/a</span>`;
      const place = [row.provinceName, row.region ? row.region.replace(/\s*\(.*\)$/, "") : ""].filter(Boolean).join(" · ");
      const cells = `
      <span class="ranking-rank" role="cell">${row.ranked ? row.rank : "—"}</span>
      <span class="ranking-name" role="cell"><b>${esc(row.name)}</b><small>${esc(place || "location n/a")} · ${sizeTag}</small></span>
      <span class="ranking-score" role="cell"><span class="ranking-bar"><span style="width:${row.ranked ? row.score : 0}%"></span></span><b>${row.ranked ? row.score.toFixed(1) : "—"}</b></span>
      <span class="ranking-evidence" role="cell"><b>${row.coverageLabel} · ${row.confidence}</b>${row.yearRange || "Insufficient current data"}</span>`;
      return `<details class="ranking-details" data-utility="${row.id}"${openIds.has(row.id) ? " open" : ""}>
        <summary class="ranking-row expandable ${row.ranked ? "" : "unranked"}" role="row">${cells}
          <span class="ranking-toggle" role="cell" aria-hidden="true"></span>
        </summary>
        ${renderFactorBreakdown(row)}
      </details>`;
    }).join("");
  }

  let mapReady = false;
  const READOUT_DEFAULT = "Hover a province to see its name.";
  function renderChoropleth(geoFiltered) {
    const svg = document.querySelector("#phlMap");
    if (!svg) return;
    const readout = document.querySelector("#mapReadout");
    // median score of ranked, filtered utilities per province
    const byProvince = new Map();
    geoFiltered.forEach(r => {
      if (!r.ranked || !r.province) return;
      (byProvince.get(r.province) ?? byProvince.set(r.province, []).get(r.province)).push(r.score);
    });
    if (!mapReady) {
      svg.setAttribute("viewBox", `0 0 ${PROV_BOUNDS.width} ${PROV_BOUNDS.height}`);
      document.querySelector("#mapLegend").innerHTML = [...RATING_BANDS.map(b =>
        `<span><i style="background:${b.color}"></i>${b.label}</span>`),
        `<span><i style="background:${NO_DATA_COLOR}"></i>No ranked utility</span>`].join("");
      svg.addEventListener("mouseleave", () => { if (readout) readout.textContent = READOUT_DEFAULT; });
      mapReady = true;
    }
    const shapes = Object.keys(PHL_PROVINCES).sort().map(pid => {
      const scores = byProvince.get(pid);
      const meta = PHL_PROVINCE_META[pid] ?? { name: pid, region: "" };
      const hasData = scores && scores.length;
      const med = hasData ? median([...scores].sort((a,b) => a - b)) : null;
      const band = hasData ? bandForScore(med) : null;
      const color = band ? band.color : NO_DATA_COLOR;
      const selected = state.provinces.has(pid);
      const detail = hasData ? `median ${med.toFixed(1)} · ${band.label} · ${scores.length} ranked`
        : (provincesWithUtilities.has(pid) ? "no ranked utility here" : "no water district in dataset");
      // clickable only where there is a ranked utility under the current filters
      return `<path d="${provincePath(pid)}" fill="${color}" class="map-prov${hasData ? "" : " map-prov-inert"}${selected ? " map-prov-selected" : ""}"
        data-name="${esc(meta.name)}" data-region="${esc(meta.region)}" data-detail="${esc(detail)}"
        ${hasData ? `data-prov="${pid}" tabindex="0" role="button"` : ""}
        aria-label="${esc(meta.name)}: ${detail}"><title>${esc(meta.name)} — ${detail}${meta.region ? ` (${esc(meta.region)})` : ""}</title></path>`;
    }).join("");
    svg.innerHTML = shapes;

    const showReadout = p => {
      if (!readout) return;
      readout.innerHTML = `<b>${p.dataset.name}</b>${p.dataset.region ? ` · ${p.dataset.region}` : ""}<br><span>${p.dataset.detail}</span>`;
    };
    svg.querySelectorAll(".map-prov").forEach(shape => {
      shape.addEventListener("mouseenter", () => showReadout(shape));
      shape.addEventListener("focus", () => showReadout(shape));
    });
    svg.querySelectorAll("[data-prov]").forEach(shape => {
      const toggle = () => {
        const pid = shape.dataset.prov;
        if (state.provinces.has(pid)) {
          state.provinces.delete(pid);
        } else {
          state.provinces.add(pid);
          // a region filter that would hide the newly picked province is cleared
          const reg = PHL_PROVINCE_META[pid]?.region ?? "";
          if (state.regions.size && !state.regions.has(reg)) state.regions.clear();
        }
        populateStaticControls();  // re-sync region + province dropdowns
        renderAll();
      };
      shape.addEventListener("click", toggle);
      shape.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
  }

  // Indicator coverage behind the ranking, derived from the cached results.
  function renderCoverage(results, year) {
    const container = document.querySelector("#coverageTable");
    if (!container) return;
    const total = results.length;
    const rows = phlFactorInputs.map(entry => {
      const factor = factorById[entry.factorId];
      const perSource = new Map();
      let count = 0;
      results.forEach(r => {
        const d = r.factors.find(f => f.factorId === entry.factorId);
        if (!d || !d.available) return;
        count++;
        (d.institutions ?? []).forEach(inst => perSource.set(inst, (perSource.get(inst) ?? 0) + 1));
      });
      const split = [...perSource.entries()].sort((a,b) => b[1] - a[1]).map(([k,n]) => `${k} ${n}`).join(" · ") || "—";
      return { name: factor.name, kind: entry.kind, weight: factor.weight, count, split };
    });
    document.querySelector("#coverageCaption").textContent =
      `For each of the ${phlFactorInputs.length} evidence-eligible factors: how many of the ${total} utilities have a usable observation through ${year} (any age; derived ratios need same-year statements) — the same rule the ranking applies.`;
    container.innerHTML = `<table class="factor-table coverage-table">
      <thead><tr><th>Factor</th><th>Type</th><th>Weight</th><th>Utilities with data</th><th>Source split</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.name}</td><td>${r.kind}</td><td>${r.weight}</td>
        <td><b>${r.count}</b> / ${total}</td><td>${r.split}</td></tr>`).join("")}</tbody>
    </table>`;
  }

  // ---- Filter controls (checkbox dropdowns; empty selection = all) --------
  // Philippine administrative regions ordered by their official number.
  const REGION_ORDER = ["NCR", "CAR", "I", "II", "III", "IV-A", "IV-B", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "BARMM"];
  const regionCode = s => (s.match(/\(([^)]+)\)\s*$/) ?? [, ""])[1];
  const regionLabel = s => {
    const code = regionCode(s), name = s.replace(/\s*\(.*\)$/, "");
    return code ? `${/^[IVX]/.test(code) ? `Region ${code}` : code} · ${name}` : name;
  };
  const regionRank = s => { const i = REGION_ORDER.indexOf(regionCode(s)); return i < 0 ? 99 : i; };

  // Shared checkbox-dropdown: renders options into a .multiselect and keeps
  // its summary label in sync with the backing Set.
  function populateMultiselect(rootSel, { options, selected, allLabel, hint, onChange }) {
    const root = document.querySelector(rootSel);
    const panel = root.querySelector(".multiselect-panel");
    panel.innerHTML = (hint ? `<span class="multiselect-hint">${hint}</span>` : "")
      + options.map(o => `<label><input type="checkbox" value="${esc(o.value)}"${selected.has(o.value) ? " checked" : ""}> ${esc(o.label)}</label>`).join("");
    const sync = () => {
      const n = selected.size;
      const one = n === 1 ? options.find(o => o.value === [...selected][0]) : null;
      root.querySelector("summary").textContent = n === 0 ? allLabel : one ? (one.short ?? one.label) : `${n} selected`;
    };
    panel.querySelectorAll("input").forEach(cb => cb.addEventListener("change", () => {
      cb.checked ? selected.add(cb.value) : selected.delete(cb.value);
      sync();
      onChange();
    }));
    sync();
  }

  function populateStaticControls() {
    const results = resultsFor(state.year);
    // year (single-select by design)
    const years = [...new Set(observations.map(r => r.year))].filter(y => y >= MIN_YEAR).sort((a,b) => b - a);
    const yearSel = document.querySelector("#yearFilter");
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    yearSel.value = String(state.year);
    populateMultiselect("#sizeFilter", {
      allLabel: "All sizes",
      options: [
        ...SIZE_BANDS.map(b => ({ value: b.key, label: `${b.name} (Cat ${b.key}, ${b.range})`, short: `${b.name} (${b.key})` })),
        { value: "unknown", label: "Size unknown" }
      ],
      selected: state.sizes,
      onChange: renderAll
    });
    // regions with ranked utilities, ordered by official region number
    const regions = [...new Set(results.filter(r => r.ranked).map(r => r.region).filter(Boolean))]
      .sort((a, b) => regionRank(a) - regionRank(b) || a.localeCompare(b));
    [...state.regions].forEach(v => { if (!regions.includes(v)) state.regions.delete(v); });
    populateMultiselect("#regionFilter", {
      allLabel: "All regions",
      options: regions.map(s => ({ value: s, label: regionLabel(s) })),
      selected: state.regions,
      onChange: () => { updateProvinceOptions(); renderAll(); }
    });
    updateProvinceOptions();
  }

  function updateProvinceOptions() {
    const results = resultsFor(state.year);
    const inScope = results.filter(r => r.ranked && r.province && (!state.regions.size || state.regions.has(r.region)));
    const provs = [...new Map(inScope.map(r => [r.province, r.provinceName])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
    [...state.provinces].forEach(p => { if (!provs.some(([id]) => id === p)) state.provinces.delete(p); });
    populateMultiselect("#provinceFilter", {
      allLabel: "All provinces",
      options: provs.map(([id, name]) => ({ value: id, label: name })),
      selected: state.provinces,
      onChange: renderAll
    });
  }

  let lastFiltered = [];   // rows currently shown in the ranking — what Export downloads
  function renderAll() {
    const results = resultsFor(state.year);
    const geoFiltered = results.filter(r => sizeOK(r) && regionOK(r) && searchOK(r) && indicatorsOK(r)); // map ignores province filter
    const listFiltered = geoFiltered.filter(provinceOK);
    lastFiltered = listFiltered;
    renderRanking(listFiltered);
    renderChoropleth(geoFiltered);
    renderCoverage(results, state.year);
  }

  // ---- Dataset indicator commonality (all raw indicators in the reports) ---
  // The "ranking input" tag is computed from actual use: an indicator is
  // tagged only if it appears in the underlying inputs of at least one ranked
  // utility's score at the selected year. Merely being wired into a fallback
  // (e.g. EBITDA components when the margin is reported directly) doesn't count.
  function usedIndicatorIds(results) {
    const used = new Set();
    results.forEach(r => {
      if (!r.ranked) return;
      r.factors.forEach(f => f.available && f.inputs?.forEach(o => used.add(o.id)));
    });
    return used;
  }
  let datasetIndAgg = null;  // whole-dataset aggregation, computed once
  function renderDatasetIndicators() {
    const container = document.querySelector("#datasetIndicatorTable");
    if (!container) return;
    if (!datasetIndAgg) {
      const byInd = new Map();
      observations.forEach(r => {
        const e = byInd.get(r.indicator_id)
          ?? byInd.set(r.indicator_id, { name: r.indicator_name || r.indicator_id, category: r.category || "", utils: new Set(), n: 0, minY: Infinity, maxY: -Infinity }).get(r.indicator_id);
        e.utils.add(r.utility_id); e.n++;
        if (r.year < e.minY) e.minY = r.year;
        if (r.year > e.maxY) e.maxY = r.year;
      });
      datasetIndAgg = [...byInd.entries()].sort((a, b) => b[1].utils.size - a[1].utils.size || a[0].localeCompare(b[0]));
    }
    const used = usedIndicatorIds(resultsFor(state.year));
    const totalU = obsByUtil.size;
    document.querySelector("#datasetIndicatorCaption").textContent =
      `All ${datasetIndAgg.length} indicators found in the source reports, most common first: how many of the ${totalU} utilities have at least one validated observation of each. ${used.size} indicators are used as ranking inputs at ${state.year}.`;
    container.innerHTML = `<table class="factor-table coverage-table dataset-ind-table">
      <thead><tr><th>Indicator</th><th>Category</th><th>Utilities with it</th><th>Share</th><th>Observations</th><th>Years</th></tr></thead>
      <tbody>${datasetIndAgg.map(([id, e]) => {
        const share = e.utils.size / totalU * 100;
        return `<tr><td><b>${esc(e.name)}</b>${used.has(id) ? ` <span class="rank-flag" title="Used in at least one ranked utility's score at ${state.year}, directly or in a derived ratio">ranking input</span>` : ""}<br><small>${esc(id)}</small></td>
          <td>${esc(e.category)}</td>
          <td><b>${e.utils.size}</b> / ${totalU}</td>
          <td><span class="cov-share"><span style="width:${share.toFixed(1)}%"></span></span> ${share.toFixed(0)}%</td>
          <td>${e.n.toLocaleString()}</td><td>${e.minY === e.maxY ? e.minY : `${e.minY}–${e.maxY}`}</td></tr>`;
      }).join("")}</tbody></table>`;
  }

  // ---- Indicator multi-select filter --------------------------------------
  function populateIndicatorFilter() {
    populateMultiselect("#indicatorFilter", {
      allLabel: "All indicators",
      hint: "Show only utilities with evidence for every ticked factor.",
      options: phlFactorInputs.map(entry => ({ value: entry.factorId, label: factorById[entry.factorId].name })),
      selected: state.indicators,
      onChange: renderAll
    });
  }

  // ---- Methodology: 23-indicator reference table ---------------------------
  const CATEGORY_LABEL = { context: "Context & operations", costs: "Cost structure", financial: "Financial strength", commercial: "Commercial discipline" };
  const FACTOR_META = {
    poverty: { formula: "Poor population ÷ total population of the service area", source: "PSA / WB PovcalNet" },
    sanitation: { formula: "People with safely managed sanitation ÷ population", source: "Utility / JMP" },
    water: { formula: "People served with piped/safe water ÷ population", source: "Utility reports, billing registry" },
    nrw: { formula: "Water lost (commercial + physical) ÷ water produced", source: "Production meters, billing" },
    staff: { formula: "Staff ÷ (connections ÷ 1,000)", source: "HR records, billing connections" },
    revenue_diversification: { formula: "% residential − % institutional/commercial revenue", source: "Income statement" },
    tariff_differential: { formula: "100 × (average tariff − average cost) ÷ average cost", source: "Tariff schedule" },
    maintenance: { formula: "Maintenance costs ÷ total O&M expenditure", source: "O&M budget, OPEX ledger" },
    electricity: { formula: "Electricity costs ÷ total O&M expenditure", source: "Utility energy bills" },
    employee: { formula: "Employee costs (salary + benefits) ÷ total OPEX", source: "Income statement" },
    om_coverage: { formula: "Water & sewerage revenue ÷ total O&M expenditure", source: "Income statement" },
    ebitda: { formula: "EBITDA ÷ revenue", source: "Financial statements" },
    cash_reserves: { formula: "Cash reserves ÷ annual operating income", source: "Balance sheet" },
    liquidity: { formula: "Cash & near-cash ÷ current liabilities", source: "Balance sheet" },
    dscr: { formula: "Cash flow available for debt service ÷ total debt service", source: "Loan agreements, statements" },
    grant_dependency: { formula: "OPEX financed by grants (proportion)", source: "CAPEX / OPEX budget" },
    debt_cash: { formula: "Total debt ÷ cash available for debt service", source: "Balance sheet" },
    debt_equity: { formula: "Total debt ÷ total equity", source: "Balance sheet" },
    debtor_days: { formula: "Net billed outstanding ÷ annual operating revenue × 365", source: "Billing system, AR ledger" },
    debtor_reduction: { formula: "((current − prior debtor days) ÷ current) × 100", source: "Billing + AR records" },
    bad_debt: { formula: "Days overdue before a bad-debt provision is booked", source: "Financial statements" },
    billing_efficiency: { formula: "Billed water ÷ water produced/bought", source: "Billing + meter records" },
    collection_efficiency: { formula: "Cash collected ÷ billed amount", source: "Billing + bank records" }
  };
  // Reconstruct each factor's 0–4 band ladder from its own scoring function.
  function deriveBands(f) {
    const seen = new Map(); const N = 800;
    for (let i = 0; i <= N; i++) {
      const v = f.min + (f.max - f.min) * i / N;
      const [p, label] = f.score(v);
      if (!seen.has(p)) seen.set(p, label);
    }
    return [...seen.entries()].sort((a,b) => b[0] - a[0]).map(([p,l]) => `${p}: ${l}`).join(" · ");
  }
  function renderIndicatorTable() {
    const container = document.querySelector("#indicatorTable");
    if (!container) return;
    const body = factors.map(f => {
      const m = FACTOR_META[f.id] ?? {};
      const eligible = ELIGIBLE_IDS.has(f.id);
      return `<tr${eligible ? ' class="indicator-eligible"' : ""}>
        <td><b>${f.name}</b>${eligible ? ` <span class="rank-flag" title="Used in the utility ranking">ranked</span>` : ""}<br><small>${esc(factorDefinitions[f.id] ?? "")}</small></td>
        <td>${CATEGORY_LABEL[f.category] ?? f.category}</td>
        <td class="ind-formula"><small>${esc(m.formula ?? "")}</small></td>
        <td>${f.weight}</td>
        <td class="ind-bands"><small>${deriveBands(f)}</small></td>
        <td><small>${esc(m.source ?? "")}</small></td>
      </tr>`;
    }).join("");
    container.innerHTML = `<table class="factor-table indicator-ref">
      <thead><tr><th>Indicator (definition)</th><th>Group</th><th>Formula</th><th>Weight</th><th>Score bands (points: range)</th><th>Typical source</th></tr></thead>
      <tbody>${body}</tbody></table>`;
  }

  // ---- Excel export --------------------------------------------------------
  // Dependency-free .xlsx writer: an OOXML workbook with inline strings inside
  // a stored (uncompressed) ZIP. Small enough for a few hundred ranked rows.
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zipStore(files, mime) {  // files: [name, xmlString][] → Blob
    const enc = new TextEncoder();
    const u16 = v => new Uint8Array([v & 255, (v >> 8) & 255]);
    const u32 = v => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
    const DOS_DATE = (1 << 5) | 1;  // 1980-01-01, the ZIP epoch
    const parts = [], central = [];
    let offset = 0;
    files.forEach(([name, text]) => {
      const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const head = [u16(20), u16(0), u16(0), u16(0), u16(DOS_DATE), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0)];
      parts.push(u32(0x04034b50), ...head, nameB, data);
      central.push(u32(0x02014b50), u16(20), ...head, u16(0), u16(0), u16(0), u32(0), u32(offset), nameB);
      offset += 30 + nameB.length + data.length;
    });
    const centralSize = central.reduce((s, c) => s + c.length, 0);
    parts.push(...central, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0));
    return new Blob(parts, { type: mime });
  }
  const xmlEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // Styled worksheet: optional frozen header row, autofilter, column widths,
  // and per-column number formats via opts.fmt ('i' thousands int, 'd' 2-dec).
  const colLetter = i => { let s = ""; i++; while (i) { s = String.fromCharCode(64 + ((i - 1) % 26 + 1)) + s; i = Math.floor((i - 1) / 26); } return s; };
  const XSTYLE = { header: 1, int: 2, dec: 3, title: 4 };
  function sheetXML(rows, opts = {}) {
    const fmtStyle = ci => opts.fmt?.[ci] === "i" ? XSTYLE.int : opts.fmt?.[ci] === "d" ? XSTYLE.dec : 0;
    const cellXML = (v, s) => v == null || v === ""
      ? (s ? `<c s="${s}"/>` : "<c/>")
      : typeof v === "number" && Number.isFinite(v)
        ? `<c t="n"${s ? ` s="${s}"` : ""}><v>${v}</v></c>`
        : `<c t="inlineStr"${s ? ` s="${s}"` : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    const body = rows.map((r, ri) => `<row>${r.map((v, ci) =>
      cellXML(v, opts.header && ri === 0 ? XSTYLE.header : opts.title && ri === 0 && ci === 0 ? XSTYLE.title : fmtStyle(ci))).join("")}</row>`).join("");
    const nCols = Math.max(1, ...rows.map(r => r.length));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
      opts.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : ""}${
      opts.widths ? `<cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : ""}<sheetData>${body}</sheetData>${
      opts.filter ? `<autoFilter ref="A1:${colLetter(nCols - 1)}${rows.length}"/>` : ""}</worksheet>`;
  }
  // Fixed style table: 0 default · 1 teal header · 2 #,##0 · 3 #,##0.00 · 4 title.
  const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><color rgb="FF1F2A2A"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF11505B"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D7180"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  function workbookBlob(sheets) {  // sheets: {name, rows, opts}[]
    const files = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) =>
        `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", XLSX_STYLES],
      ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXML(s.rows, s.opts)])
    ];
    return zipStore(files, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  // Non-default filters as human-readable lines (shared by both exports).
  function activeFilterLines() {
    const lines = [];
    if (state.search) lines.push(`Search: "${state.search}"`);
    if (state.sizes.size) lines.push(`Size: ${[...state.sizes].map(k => k === "unknown" ? "size unknown" : `LWUA category ${k}`).join(", ")}`);
    if (state.regions.size) lines.push(`Regions: ${[...state.regions].map(regionLabel).join(", ")}`);
    if (state.provinces.size) lines.push(`Provinces: ${[...state.provinces].map(p => PHL_PROVINCE_META[p]?.name ?? p).join(", ")}`);
    if (state.indicators.size) lines.push(`Required indicators: ${[...state.indicators].map(id => factorById[id].name).join(", ")}`);
    return lines;
  }
  const rankedFiltered = () => lastFiltered.filter(r => r.ranked).sort((a, b) => a.rank - b.rank);
  const download = (blob, filename) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  function exportExcel() {
    const rows = rankedFiltered();
    const round = (v, d) => v == null ? null : Number(v.toFixed(d));
    // One wide, filterable sheet: utility metadata + key financials + every
    // factor as a value/points column pair (full provenance in Indicator data).
    const header = ["Rank", "Utility ID", "Utility", "Province", "Region", "LWUA size", "Median connections",
      "Score (0-100)", "Rating band (demo)", `Factors (of ${phlFactorInputs.length})`, "Factor data years",
      ...KEY_FINANCIALS.map(k => `${k.label} (PHP)`), "Financials years",
      ...phlFactorInputs.flatMap(e => { const n = factorById[e.factorId].name; return [`${n} — value`, `${n} — points`]; })];
    const fmt = [null, null, null, null, null, null, "i", "d", null, null, null,
      "i", "i", "i", "i", "i", null, ...phlFactorInputs.flatMap(() => ["d", null])];
    const widths = [7, 26, 34, 16, 26, 18, 13, 11, 28, 10, 15, 15, 15, 15, 15, 15, 12, ...phlFactorInputs.flatMap(() => [13, 8])];
    const ranking = [header, ...rows.map(r => {
      const kf = KEY_FINANCIALS.map(k => latestObservation(r.id, k.id, state.year));
      const kfYears = [...new Set(kf.filter(Boolean).map(o => o.year))].sort((a, b) => a - b);
      return [r.rank, r.id, r.name, r.provinceName ?? "", r.region ? regionLabel(r.region) : "", r.size ? `${r.size.name} (${r.size.key})` : "unknown",
        r.size ? Math.round(r.size.connections) : null, round(r.score, 1), bandForScore(r.score).label, r.available,
        r.yearRange.replace(/^Data years? /, ""),
        ...kf.map(o => o && Number.isFinite(o.value) ? Math.round(o.value) : null),
        kfYears.join(", "),
        ...phlFactorInputs.flatMap(e => {
          const f = r.factors.find(x => x.factorId === e.factorId);
          return f?.available ? [round(f.value, 2), f.points] : [null, null];
        })];
    })];
    // Every validated observation (≤ through-year) behind the exported utilities.
    const indicatorData = [["Rank", "Utility ID", "Utility", "Indicator ID", "Indicator", "Category", "Year", "Value", "Unit", "Source institution", "Verification"]];
    rows.forEach(r => (obsByUtil.get(r.id) ?? [])
      .filter(o => o.year <= state.year)
      .sort((a, b) => a.indicator_id.localeCompare(b.indicator_id) || b.year - a.year)
      .forEach(o => indicatorData.push([r.rank, r.id, r.name, o.indicator_id, o.indicator_name || "", o.category || "",
        o.year, Number.isFinite(o.value) ? o.value : null, o.unit || "", shortInstitution(o.source_institution), o.verification_level || ""])));
    const filterDesc = [
      ["WaterCRED · Philippines — filtered ranking export"], [],
      ["Exported", new Date().toISOString().slice(0, 10)],
      ["Through year", state.year],
      ["Active filters", activeFilterLines().join(" · ") || "none (all utilities)"],
      ["Utilities exported", rows.length], [],
      ["A relative, renormalized indication — not the full 23-factor index and not a credit rating."],
      ["Each utility is scored on the workbook factors its validated data supports (0-4 bands); score = Σ(points × weight) ÷ Σ(4 × weight) × 100. Minimum 4 evidenced factors; each factor uses the latest observation up to the selected year with no age limit (data years disclosed per factor); derived ratios combine same-year statements only."],
      ["The Ranking sheet holds one row per utility: key financials (absolute PHP, context only — not scored) and each factor's value and 0-4 points. The Indicator data sheet lists every validated observation up to the selected year for the exported utilities, with year, unit, source institution and verification level. Amounts reported as PHP million and volumes as million m³ are normalized to PHP / m³."],
      ["Utility-to-province mapping is compiled and approximate. Sources: COA Annual Audit/Financial Reports, LWUA monitoring data, Manila Water statements."]
    ];
    const blob = workbookBlob([
      { name: "Ranking", rows: ranking, opts: { header: true, freeze: true, filter: true, fmt, widths } },
      { name: "Indicator data", rows: indicatorData, opts: { header: true, freeze: true, filter: true, widths: [7, 26, 34, 30, 34, 13, 8, 16, 10, 20, 13] } },
      { name: "Export notes", rows: filterDesc, opts: { title: true, widths: [22, 90] } }
    ]);
    download(blob, `watercred_philippines_${state.year}.xlsx`);
  }

  // ---- PowerPoint export (top 10 filtered utilities — no rating info) -----
  // Same hand-built OOXML approach as the Excel export: presentation, master,
  // layout, theme and one slide per utility inside a stored ZIP.
  const IN_EMU = 914400;   // EMU per inch; slide canvas is 13.333in × 7.5in
  const emu = inches => Math.round(inches * IN_EMU);
  const PPTC = { dark: "11505B", teal: "1D7180", cream: "F7F3EA", ink: "1F2A2A", muted: "66797A", lime: "C9DD7B", zebra: "EDF2EA", faint: "8AA0A0", light: "A9C5C5", pale: "DCEBE8" };
  const PPT_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const SPTREE_HEAD = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
  let pptShapeId = 2;
  const pptRun = r => `<a:r><a:rPr lang="en-US" sz="${Math.round(r.sz * 100)}"${r.b ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${r.color}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${xmlEsc(r.text)}</a:t></a:r>`;
  const pptPara = p => `<a:p><a:pPr algn="${p.align ?? "l"}">${p.spcB ? `<a:spcBef><a:spcPts val="${p.spcB * 100}"/></a:spcBef>` : ""}</a:pPr>${(p.runs ?? [p]).map(pptRun).join("")}</a:p>`;
  const pptRect = (x, y, w, h, fill, rounded) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${pptShapeId++}" name="rect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="${rounded ? "roundRect" : "rect"}">${rounded ? `<a:avLst><a:gd name="adj" fmla="val 4000"/></a:avLst>` : "<a:avLst/>"}</a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
  const pptText = (x, y, w, h, paras, anchor = "t") =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${pptShapeId++}" name="text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras.map(pptPara).join("")}</p:txBody></p:sp>`;
  function pptTable(x, y, w, colFracs, trows) {  // trows: {h, fill, cells:[{text,sz,b,color,align}]}
    const grid = colFracs.map(f => `<a:gridCol w="${Math.round(emu(w) * f)}"/>`).join("");
    const body = trows.map(tr => `<a:tr h="${emu(tr.h)}">${tr.cells.map(c =>
      `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${pptPara(c)}</a:txBody><a:tcPr marL="64008" marR="64008" marT="18288" marB="18288" anchor="ctr"><a:solidFill><a:srgbClr val="${tr.fill}"/></a:solidFill></a:tcPr></a:tc>`).join("")}</a:tr>`).join("");
    return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${pptShapeId++}" name="table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(trows.reduce((s, tr) => s + tr.h, 0))}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${grid}</a:tblGrid>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  }
  const pptSlideXML = shapes => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${PPT_NS}><p:cSld><p:spTree>${SPTREE_HEAD}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const PPT_THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="WaterCRED"><a:themeElements><a:clrScheme name="wc"><a:dk1><a:srgbClr val="1F2A2A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="11505B"/></a:dk2><a:lt2><a:srgbClr val="F7F3EA"/></a:lt2><a:accent1><a:srgbClr val="1D7180"/></a:accent1><a:accent2><a:srgbClr val="C9DD7B"/></a:accent2><a:accent3><a:srgbClr val="44A892"/></a:accent3><a:accent4><a:srgbClr val="E0A84C"/></a:accent4><a:accent5><a:srgbClr val="BC624E"/></a:accent5><a:accent6><a:srgbClr val="66797A"/></a:accent6><a:hlink><a:srgbClr val="1D7180"/></a:hlink><a:folHlink><a:srgbClr val="66797A"/></a:folHlink></a:clrScheme><a:fontScheme name="wc"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="wc"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  function pptxBlob(slides) {
    const RELS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
    const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const files = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${RELS}><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
      ["ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${PPT_NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) =>
        `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
      ["ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${RELS}><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) =>
        `<Relationship Id="rId${2 + i}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`],
      ["ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${PPT_NS}><p:cSld><p:spTree>${SPTREE_HEAD}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`],
      ["ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${RELS}><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`],
      ["ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${PPT_NS}><p:cSld><p:spTree>${SPTREE_HEAD}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
      ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${RELS}><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
      ["ppt/theme/theme1.xml", PPT_THEME],
      ...slides.flatMap((shapes, i) => [
        [`ppt/slides/slide${i + 1}.xml`, pptSlideXML(shapes)],
        [`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${RELS}><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`]
      ])
    ];
    return zipStore(files, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  }

  function pptTitleSlide(count) {
    const filters = activeFilterLines();
    return pptRect(0, 0, 13.333, 7.5, PPTC.dark)
      + pptRect(0, 7.26, 13.333, 0.24, PPTC.lime)
      + pptText(0.9, 2.0, 11.5, 2.0, [
        { text: "WATERCRED · PHILIPPINES", sz: 15, b: true, color: PPTC.lime },
        { text: "Water utility profiles", sz: 44, b: true, color: "FFFFFF", spcB: 8 }
      ])
      + pptText(0.9, 4.15, 11.5, 2.6, [
        { text: `${count} ${count === 1 ? "utility" : "utilities"} · audited financial and operational data through ${state.year}`, sz: 17, color: PPTC.pale },
        ...(filters.length ? filters.map(t => ({ text: t, sz: 12.5, color: PPTC.light, spcB: 4 })) : [{ text: "Selection: all utilities, no filters applied", sz: 12.5, color: PPTC.light, spcB: 4 }]),
        { text: `Compiled ${new Date().toISOString().slice(0, 10)} · COA Annual Audit/Financial Reports · LWUA · Manila Water`, sz: 10.5, color: PPTC.faint, spcB: 10 }
      ]);
  }
  // Overview slide: the utilities in the deck, in slide order — no rating info.
  function pptOverviewSlide(top) {
    const trows = [
      { h: 0.34, fill: PPTC.dark, cells: ["Utility", "Province", "Region", "LWUA size", "Connections"].map((t, i) =>
        ({ text: t, sz: 11, b: true, color: "FFFFFF", align: i === 4 ? "r" : "l" })) },
      ...top.map((r, i) => ({ h: 0.42, fill: i % 2 ? PPTC.zebra : "FFFFFF", cells: [
        { text: r.name, sz: 11.5, b: true, color: PPTC.ink },
        { text: r.provinceName ?? "—", sz: 11, color: PPTC.muted },
        { text: r.region ? regionLabel(r.region) : "—", sz: 11, color: PPTC.muted },
        { text: r.size ? `${r.size.name} (${r.size.key})` : "unknown", sz: 11, color: PPTC.muted },
        { text: r.size ? Math.round(r.size.connections).toLocaleString() : "—", sz: 11, color: PPTC.muted, align: "r" }
      ] }))
    ];
    return pptRect(0, 0, 13.333, 7.5, PPTC.cream)
      + pptRect(0, 0, 13.333, 0.16, PPTC.dark)
      + pptText(0.9, 0.52, 11.5, 0.68, [{ text: `The ${top.length} utilities in this deck`, sz: 26, b: true, color: PPTC.dark }])
      + pptText(0.9, 1.18, 11.5, 0.4, [{ text: `One profile slide per utility follows, in the same order. Audited data through ${state.year}.`, sz: 12, color: PPTC.muted }])
      + pptTable(0.9, 1.72, 11.5, [0.34, 0.19, 0.23, 0.14, 0.10], trows);
  }
  function pptUtilitySlide(r) {
    const place = [r.provinceName, r.region ? regionLabel(r.region) : null].filter(Boolean).join(" · ");
    const sizeLine = r.size ? `${r.size.name} utility (LWUA category ${r.size.key}) · ${Math.round(r.size.connections).toLocaleString()} connections` : "size unknown";
    const kf = KEY_FINANCIALS.map(k => ({ k, o: latestObservation(r.id, k.id, state.year) })).filter(e => e.o && Number.isFinite(e.o.value));
    const facts = r.factors.filter(f => f.available);
    let s = pptRect(0, 0, 13.333, 7.5, PPTC.cream)
      + pptRect(0, 0, 13.333, 1.28, PPTC.dark)
      + pptText(0.55, 0.12, 9.9, 0.64, [{ text: r.name, sz: 24, b: true, color: "FFFFFF" }])
      + pptText(0.55, 0.74, 9.9, 0.44, [{ text: `${place || "location n/a"} · ${sizeLine}`, sz: 12, color: PPTC.light }])
      + pptText(10.55, 0.42, 2.35, 0.5, [{ text: "WaterCRED", sz: 12, b: true, color: PPTC.lime, align: "r" }]);
    s += pptRect(0.55, 1.62, 4.05, 5.25, "FFFFFF", true)
      + pptText(0.85, 1.86, 3.5, 0.4, [{ text: "KEY FINANCIALS", sz: 12, b: true, color: PPTC.teal }]);
    kf.forEach((e, i) => {
      s += pptText(0.85, 2.32 + i * 0.9, 3.5, 0.88, [
        { text: e.k.label, sz: 11, color: PPTC.muted },
        { text: formatObsValue(e.o), sz: 19, b: true, color: PPTC.ink },
        { text: `${e.o.year} · ${shortInstitution(e.o.source_institution)}`, sz: 9, color: PPTC.faint }
      ]);
    });
    s += pptText(5.0, 1.62, 7.8, 0.4, [{ text: "EVIDENCED INDICATORS", sz: 12, b: true, color: PPTC.teal }]);
    const trows = [
      { h: 0.32, fill: PPTC.dark, cells: [
        { text: "Indicator", sz: 10.5, b: true, color: "FFFFFF" },
        { text: "Value", sz: 10.5, b: true, color: "FFFFFF" },
        { text: "Year", sz: 10.5, b: true, color: "FFFFFF" },
        { text: "Source", sz: 10.5, b: true, color: "FFFFFF" }] },
      ...facts.map((f, i) => ({ h: 0.33, fill: i % 2 ? PPTC.zebra : "FFFFFF", cells: [
        { text: f.name, sz: 10.5, color: PPTC.ink },
        { text: f.formatted, sz: 10.5, b: true, color: PPTC.ink },
        { text: f.years.join(", "), sz: 10.5, color: PPTC.muted },
        { text: f.institutions.join(" + "), sz: 10.5, color: PPTC.muted }] }))
    ];
    s += pptTable(5.0, 2.08, 7.8, [0.36, 0.18, 0.14, 0.32], trows);
    s += pptText(0.55, 7.06, 12.2, 0.36, [{ text: `Latest validated observation per line, through ${state.year}. Audited sources: COA Annual Audit/Financial Reports · LWUA · Manila Water.`, sz: 9, color: PPTC.faint }]);
    return s;
  }
  function pptNotesSlide() {
    const bullet = (text, first) => ({ text, sz: 13, color: PPTC.ink, spcB: first ? 0 : 8 });
    return pptRect(0, 0, 13.333, 7.5, PPTC.cream)
      + pptRect(0, 0, 13.333, 0.16, PPTC.dark)
      + pptText(0.9, 0.75, 11.5, 0.7, [{ text: "Data & notes", sz: 27, b: true, color: PPTC.dark }])
      + pptText(0.9, 1.7, 11.5, 5.2, [
        bullet("All figures are validated observations from audited sources: COA Annual Audit Reports and Annual Financial Reports (water districts), LWUA monitoring data, and Manila Water statements.", true),
        bullet(`Each figure is the utility's latest validated observation up to ${state.year}; the statement year is shown next to every value.`),
        bullet("Amounts reported in PHP million are normalized to PHP, and volumes in million m³ to m³. Derived ratios (e.g. debt to equity) combine same-year statements only."),
        bullet("Key financials are absolute statement lines shown for context; indicator values are as reported or derived per the WaterCRED definitions."),
        bullet("Utility-to-province assignment is a compiled, approximate mapping — not an official geographic field."),
        { text: `Prepared with WaterCRED · ${new Date().toISOString().slice(0, 10)}`, sz: 11, color: PPTC.faint, spcB: 12 }
      ]);
  }
  function exportPPT() {
    const top = rankedFiltered().slice(0, 10);
    if (!top.length) return;
    pptShapeId = 2;
    const slides = [pptTitleSlide(top.length), pptOverviewSlide(top), ...top.map(pptUtilitySlide), pptNotesSlide()];
    download(pptxBlob(slides), `watercred_utilities_${state.year}.pptx`);
  }

  // ---- Load & wire ---------------------------------------------------------
  async function load() {
    const status = document.querySelector("#dataStatus");
    try {
      const response = await fetch("data/philippines_validated.csv");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      observations = parseCSV(await response.text()).map(r => ({ ...r, year: Number(r.year), value: Number(r.value) })).map(normalizeRow);
      observations.forEach(r => {
        if (r.utility_name && !csvNames.has(r.utility_id)) csvNames.set(r.utility_id, r.utility_name);
        (obsByUtil.get(r.utility_id) ?? obsByUtil.set(r.utility_id, []).get(r.utility_id)).push(r);
      });
      const utilities = new Set(observations.map(r => r.utility_id));
      const years = [...new Set(observations.map(r => r.year))];
      if (!years.includes(state.year)) state.year = Math.max(...years.filter(y => y >= MIN_YEAR));
      status.textContent = `${observations.length.toLocaleString()} validated observations · ${utilities.size} water utilities · ${Math.min(...years.filter(y => y >= MIN_YEAR))}–${Math.max(...years)} · sources: COA, LWUA, Manila Water`;
      document.querySelector("#utilityList").innerHTML =
        [...new Set(csvNames.values())].sort().map(n => `<option value="${esc(n)}">`).join("");
      populateStaticControls();
      populateIndicatorFilter();
      renderIndicatorTable();
      renderDatasetIndicators();
      renderAll();
    } catch (error) {
      status.className = "data-status error";
      status.textContent = "Could not load philippines_validated.csv. Start the included local server (python3 -m http.server 8000) instead of opening the file directly.";
    }
  }

  document.querySelector("#yearFilter").addEventListener("change", e => { state.year = Number(e.target.value); populateStaticControls(); renderDatasetIndicators(); renderAll(); });
  document.querySelector("#searchFilter").addEventListener("input", e => { state.search = e.target.value.trim().toLowerCase(); renderAll(); });
  document.querySelector("#exportBtn").addEventListener("click", exportExcel);
  document.querySelector("#exportPptBtn").addEventListener("click", exportPPT);
  document.querySelector("#filterReset").addEventListener("click", () => {
    state.sizes.clear(); state.regions.clear(); state.provinces.clear(); state.search = ""; state.indicators.clear();
    document.querySelector("#searchFilter").value = "";
    populateStaticControls();
    populateIndicatorFilter();
    renderAll();
  });
  // Close any open filter dropdown on outside click.
  document.addEventListener("click", e => {
    document.querySelectorAll(".multiselect[open]").forEach(ms => { if (!ms.contains(e.target)) ms.open = false; });
  });
  // Nav links can point inside a collapsed <details> (e.g. #coverage) — open it.
  const openDetailsForHash = () => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (!el) return;
    if (el.tagName === "DETAILS") el.open = true;
    el.closest("details")?.setAttribute("open", "");
  };
  window.addEventListener("hashchange", openDetailsForHash);
  openDetailsForHash();

  load();
})();
