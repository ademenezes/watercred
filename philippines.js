"use strict";

// WaterCRED · Philippines — standalone ranking + province map + methodology app.
// Loads core.js (shared 23-factor model, parseCSV, compact) and phl-geo.js
// (province polygons + utility→province mapping), then renders everything here.
// The Georgia engine (core.js initApp) is intentionally left untouched.

(() => {
  const MIN_RANKED_FACTORS = 4;   // ≥4 evidenced factors required to rank
  const MAX_AGE = 5;              // observations older than 5 years are excluded
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
    "Manila Water Company": "Manila Water"
  };
  const shortInstitution = s => SOURCE_SHORT[s] ?? s;
  const sourceOf = row => ({ institution: row.source_institution, indicator: row.indicator_id, year: row.year, verification: row.verification_level });

  // Latest year ≤ selected year (within MAX_AGE) at which every required
  // indicator has an observation — derived ratios never mix statement years.
  // `urows` is the utility's own observations (pre-indexed for speed).
  function latestConsistentSet(urows, requiredIds, optionalIds, year) {
    for (let y = year; y >= year - MAX_AGE; y--) {
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
    const observation = helpers.latestObservation(utilityId, indicatorId, year, MAX_AGE);
    return observation ? { value: observation.value, years: [observation.year], sources: [sourceOf(observation)] } : null;
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
    return { value: ebitda / revenue * 100, years: [set.year], sources: setSources(set), derived: "same-year statements" };
  }

  function debtEquity(utilityId, year, helpers) {
    // FIN_DEBT_TO_EQUITY in the CSV is a bare ratio (e.g. 0.45), which the
    // workbook's percentage bands would misread — so derive the % explicitly.
    const set = latestConsistentSet(helpers.utilityObs(utilityId), ["FIN_TOTAL_LIABILITIES", "FIN_EQUITY"], [], year);
    if (!set) return null;
    const equity = set.values.get("FIN_EQUITY");
    // Negative or zero equity: leverage is worse than any workbook band — score 0 directly.
    if (equity <= 0) return { points: 0, years: [set.year], sources: setSources(set), note: "negative equity — worst band by demo convention" };
    return { value: set.values.get("FIN_TOTAL_LIABILITIES") / equity * 100, years: [set.year], sources: setSources(set), derived: "same-year statements" };
  }

  function staffPerThousand(utilityId, year, helpers) {
    const uobs = helpers.utilityObs(utilityId);
    for (const employeeId of ["INST_TOTAL_EMPLOYEES", "INST_PERMANENT_EMPLOYEES"]) {
      const set = latestConsistentSet(uobs, [employeeId, "OPS_CONNECTIONS_TOTAL"], [], year);
      if (set && set.values.get("OPS_CONNECTIONS_TOTAL") > 0) {
        return { value: set.values.get(employeeId) / set.values.get("OPS_CONNECTIONS_TOTAL") * 1000, years: [set.year], sources: setSources(set), derived: "employees ÷ connections" };
      }
    }
    const productivity = direct("INST_PRODUCTIVITY_CONN_PER_STAFF")(utilityId, year, helpers);
    if (productivity && productivity.value > 0) return { value: 1000 / productivity.value, years: productivity.years, sources: productivity.sources, derived: "1,000 ÷ connections per staff" };
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
    const confidence = available >= 8 ? "High coverage" : available >= 6 ? "Medium coverage" : available >= MIN_RANKED_FACTORS ? "Low coverage" : "Unranked";
    const detailNote = ranked
      ? `Scored on ${available} of 9 evidence-eligible factors (of the 23-factor model): ${points} ÷ ${maxPoints} weighted points × 100 = ${score.toFixed(1)}.`
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
      .filter(r => r.indicator_id === "OPS_CONNECTIONS_TOTAL" && r.year <= year && Number.isFinite(r.value))
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
  function latestObservation(utilityId, indicatorId, year, maxAge) {
    return (obsByUtil.get(utilityId) ?? [])
      .filter(r => r.indicator_id === indicatorId && r.year <= year && year - r.year <= maxAge)
      .sort((a,b) => b.year - a.year)[0] || null;
  }
  const helpers = { latestObservation, clamp, utilityName, observations: () => observations, utilityObs: id => obsByUtil.get(id) ?? [] };

  const state = { year: DEFAULT_YEAR, size: "all", region: "all", province: "all", search: "", indicators: new Set() };
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

  const sizeOK = r => state.size === "all" || (state.size === "unknown" ? !r.size : r.size?.key === state.size);
  const regionOK = r => state.region === "all" || r.region === state.region;
  const provinceOK = r => state.province === "all" || r.province === state.province;
  const searchOK = r => !state.search
    || [r.name, r.id, r.provinceName, r.region].some(s => s && s.toLowerCase().includes(state.search));
  // Indicator filter: utility must have evidence for EVERY selected factor.
  const indicatorsOK = r => !state.indicators.size
    || [...state.indicators].every(id => r.factors.find(f => f.factorId === id)?.available);

  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Per-utility factor breakdown shown inside each expandable ranking row.
  function renderFactorBreakdown(row) {
    const ordered = [...row.factors.filter(f => f.available), ...row.factors.filter(f => !f.available)];
    const body = ordered.map(f => f.available
      ? `<tr><td>${f.name}${f.unitNote ? ` <small>(${esc(f.unitNote)})</small>` : ""}</td>
          <td>${esc(f.formatted)}</td>
          <td><b>${f.points}/4</b> <small>${esc(f.band)}</small></td>
          <td>${f.weight}</td><td>${f.weighted}</td>
          <td>${f.years.join(", ")}</td><td>${esc(f.sourceLabel)}</td></tr>`
      : `<tr class="factor-missing"><td>${f.name}</td><td colspan="6">no validated observation within 5 years</td></tr>`
    ).join("");
    return `<div class="factor-breakdown">
      <p class="factor-breakdown-note">${esc(row.detailNote ?? "")}</p>
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
      const sizeTag = row.size ? `${row.size.name} <span class="size-chip">${row.size.key}</span>` : `<span class="size-chip unknown">size n/a</span>`;
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
      const selected = state.province === pid;
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
        state.province = state.province === shape.dataset.prov ? "all" : shape.dataset.prov;
        // keep the province dropdown in sync (and its region context)
        if (state.province !== "all") {
          const reg = PHL_PROVINCE_META[state.province]?.region ?? "all";
          if (state.region !== "all" && state.region !== reg) state.region = "all";
        }
        syncControls();
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
      `For each of the nine evidence-eligible factors: how many of the ${total} utilities have a usable observation through ${year} (≤5 years old; derived ratios need same-year statements) — the same rule the ranking applies.`;
    container.innerHTML = `<table class="factor-table coverage-table">
      <thead><tr><th>Factor</th><th>Type</th><th>Weight</th><th>Utilities with data</th><th>Source split</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.name}</td><td>${r.kind}</td><td>${r.weight}</td>
        <td><b>${r.count}</b> / ${total}</td><td>${r.split}</td></tr>`).join("")}</tbody>
    </table>`;
  }

  // ---- Filter controls -----------------------------------------------------
  function populateStaticControls() {
    const results = resultsFor(state.year);
    // years
    const years = [...new Set(observations.map(r => r.year))].filter(y => y >= MIN_YEAR).sort((a,b) => b - a);
    document.querySelector("#yearFilter").innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    // size
    document.querySelector("#sizeFilter").innerHTML =
      `<option value="all">All sizes</option>` +
      SIZE_BANDS.map(b => `<option value="${b.key}">${b.name} (Cat ${b.key}, ${b.range})</option>`).join("") +
      `<option value="unknown">Size unknown</option>`;
    // region (only those with ranked utilities)
    const regions = [...new Set(results.filter(r => r.ranked).map(r => r.region).filter(Boolean))].sort();
    document.querySelector("#regionFilter").innerHTML =
      `<option value="all">All regions</option>` + regions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
    syncControls();
    updateProvinceOptions();
  }

  function updateProvinceOptions() {
    const results = resultsFor(state.year);
    const inScope = results.filter(r => r.ranked && r.province && (state.region === "all" || r.region === state.region));
    const provs = [...new Map(inScope.map(r => [r.province, r.provinceName])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
    const sel = document.querySelector("#provinceFilter");
    sel.innerHTML = `<option value="all">All provinces</option>` +
      provs.map(([id,name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("");
    if (state.province !== "all" && !provs.some(([id]) => id === state.province)) state.province = "all";
    sel.value = state.province;
  }

  function syncControls() {
    document.querySelector("#yearFilter").value = String(state.year);
    document.querySelector("#sizeFilter").value = state.size;
    document.querySelector("#regionFilter").value = state.region;
    document.querySelector("#provinceFilter").value = state.province;
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
  // Raw CSV indicators that feed the nine ranked factors, directly or as
  // components of a derived ratio (EBITDA, debt/equity, staff density).
  const RANKING_INPUT_IDS = new Set([
    "FIN_COST_COVERAGE", "FIN_COLLECTION_EFFICIENCY", "OPS_NRW_PCT", "FIN_ENERGY_COST_SHARE",
    "FIN_STAFF_COST_SHARE", "FIN_CURRENT_LIQUIDITY", "FIN_EBITDA_MARGIN", "FIN_NET_INCOME",
    "FIN_DEPRECIATION", "FIN_INTEREST_EXPENSE", "FIN_REVENUE", "FIN_NONOP_INCOME",
    "FIN_TOTAL_LIABILITIES", "FIN_EQUITY", "INST_TOTAL_EMPLOYEES", "INST_PERMANENT_EMPLOYEES",
    "OPS_CONNECTIONS_TOTAL", "INST_PRODUCTIVITY_CONN_PER_STAFF"
  ]);
  function renderDatasetIndicators() {
    const container = document.querySelector("#datasetIndicatorTable");
    if (!container) return;
    const byInd = new Map();
    observations.forEach(r => {
      const e = byInd.get(r.indicator_id)
        ?? byInd.set(r.indicator_id, { name: r.indicator_name || r.indicator_id, category: r.category || "", utils: new Set(), n: 0, minY: Infinity, maxY: -Infinity }).get(r.indicator_id);
      e.utils.add(r.utility_id); e.n++;
      if (r.year < e.minY) e.minY = r.year;
      if (r.year > e.maxY) e.maxY = r.year;
    });
    const totalU = obsByUtil.size;
    const rows = [...byInd.entries()].sort((a, b) => b[1].utils.size - a[1].utils.size || a[0].localeCompare(b[0]));
    document.querySelector("#datasetIndicatorCaption").textContent =
      `All ${rows.length} indicators found in the source reports, most common first: how many of the ${totalU} utilities have at least one validated observation of each.`;
    container.innerHTML = `<table class="factor-table coverage-table dataset-ind-table">
      <thead><tr><th>Indicator</th><th>Category</th><th>Utilities with it</th><th>Share</th><th>Observations</th><th>Years</th></tr></thead>
      <tbody>${rows.map(([id, e]) => {
        const share = e.utils.size / totalU * 100;
        return `<tr><td><b>${esc(e.name)}</b>${RANKING_INPUT_IDS.has(id) ? ` <span class="rank-flag" title="Feeds the ranking's nine evidence-eligible factors">ranking input</span>` : ""}<br><small>${esc(id)}</small></td>
          <td>${esc(e.category)}</td>
          <td><b>${e.utils.size}</b> / ${totalU}</td>
          <td><span class="cov-share"><span style="width:${share.toFixed(1)}%"></span></span> ${share.toFixed(0)}%</td>
          <td>${e.n.toLocaleString()}</td><td>${e.minY === e.maxY ? e.minY : `${e.minY}–${e.maxY}`}</td></tr>`;
      }).join("")}</tbody></table>`;
  }

  // ---- Indicator multi-select filter --------------------------------------
  function syncIndicatorSummary() {
    const n = state.indicators.size;
    document.querySelector("#indicatorFilterSummary").textContent =
      n === 0 ? "All indicators" : n === 1 ? factorById[[...state.indicators][0]].name : `${n} indicators selected`;
  }
  function populateIndicatorFilter() {
    const panel = document.querySelector("#indicatorFilterPanel");
    panel.innerHTML = `<span class="multiselect-hint">Show only utilities with evidence for every ticked factor.</span>`
      + phlFactorInputs.map(entry => {
        const f = factorById[entry.factorId];
        return `<label><input type="checkbox" value="${entry.factorId}"${state.indicators.has(entry.factorId) ? " checked" : ""}> ${esc(f.name)}</label>`;
      }).join("");
    panel.querySelectorAll("input").forEach(cb => cb.addEventListener("change", () => {
      cb.checked ? state.indicators.add(cb.value) : state.indicators.delete(cb.value);
      syncIndicatorSummary();
      renderAll();
    }));
    syncIndicatorSummary();
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
  function zipStore(files) {  // files: [name, xmlString][] → Blob (.xlsx)
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
    return new Blob(parts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  const xmlEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const sheetXML = rows => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map(r =>
    `<row>${r.map(c => c == null || c === ""
      ? "<c/>"
      : typeof c === "number" && Number.isFinite(c)
        ? `<c t="n"><v>${c}</v></c>`
        : `<c t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  function workbookBlob(sheets) {  // sheets: [name, rows][]
    const files = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([name], i) =>
        `<sheet name="${xmlEsc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`],
      ...sheets.map(([, rows], i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXML(rows)])
    ];
    return zipStore(files);
  }

  function exportExcel() {
    const rows = lastFiltered.filter(r => r.ranked).sort((a, b) => a.rank - b.rank);
    const round = (v, d) => v == null ? null : Number(v.toFixed(d));
    const ranking = [
      ["Rank (national)", "Utility ID", "Utility", "Province", "Region", "LWUA size category", "Median connections", "Score (0-100)", "Rating band (demo)", "Evidenced factors (of 9)", "Coverage", "Data years"],
      ...rows.map(r => [r.rank, r.id, r.name, r.provinceName ?? "", r.region, r.size ? `${r.size.name} (${r.size.key})` : "unknown",
        r.size ? r.size.connections : null, round(r.score, 1), bandForScore(r.score).label, r.available, r.confidence, r.yearRange.replace(/^Data years? /, "")])
    ];
    const detail = [["Rank (national)", "Utility ID", "Utility", "Factor", "Value", "Value (display)", "Points (0-4)", "Band", "Weight", "Weighted points", "Data years", "Source"]];
    rows.forEach(r => r.factors.filter(f => f.available).forEach(f =>
      detail.push([r.rank, r.id, r.name, f.name, round(f.value, 3), f.formatted, f.points, f.band, f.weight, f.weighted, f.years.join(", "), f.sourceLabel])));
    // Every validated observation (≤ through-year) behind the exported utilities.
    const indicatorData = [["Rank (national)", "Utility ID", "Utility", "Indicator ID", "Indicator", "Category", "Year", "Value", "Unit", "Source institution", "Verification"]];
    rows.forEach(r => (obsByUtil.get(r.id) ?? [])
      .filter(o => o.year <= state.year)
      .sort((a, b) => a.indicator_id.localeCompare(b.indicator_id) || b.year - a.year)
      .forEach(o => indicatorData.push([r.rank, r.id, r.name, o.indicator_id, o.indicator_name || "", o.category || "",
        o.year, Number.isFinite(o.value) ? o.value : null, o.unit || "", shortInstitution(o.source_institution), o.verification_level || ""])));
    const filterDesc = [
      ["WaterCRED · Philippines — filtered ranking export"], [],
      ["Exported", new Date().toISOString().slice(0, 10)],
      ["Through year", state.year],
      ["Size filter", state.size === "all" ? "all sizes" : state.size === "unknown" ? "size unknown" : `LWUA category ${state.size}`],
      ["Region filter", state.region === "all" ? "all regions" : state.region],
      ["Province filter", state.province === "all" ? "all provinces" : (PHL_PROVINCE_META[state.province]?.name ?? state.province)],
      ["Search", state.search || "—"],
      ["Indicator filter", state.indicators.size ? [...state.indicators].map(id => factorById[id].name).join(", ") : "all indicators"],
      ["Utilities exported", rows.length], [],
      ["A relative, renormalized indication — not the full 23-factor index and not a credit rating."],
      ["Each utility is scored on the workbook factors its validated data supports (0-4 bands); score = Σ(points × weight) ÷ Σ(4 × weight) × 100. Minimum 4 evidenced factors; observations ≤5 years old; derived ratios combine same-year statements only."],
      ["The Indicator data sheet lists every validated observation up to the selected year for the exported utilities — all indicators, with year, unit, source institution and verification level. Amounts reported as PHP million and volumes as million m³ are normalized to PHP / m³."],
      ["Utility-to-province mapping is compiled and approximate. Sources: COA Annual Audit/Financial Reports, LWUA monitoring data, Manila Water statements."]
    ];
    const blob = workbookBlob([["Ranking", ranking], ["Factor detail", detail], ["Indicator data", indicatorData], ["Export notes", filterDesc]]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `watercred_philippines_${state.year}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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

  document.querySelector("#yearFilter").addEventListener("change", e => { state.year = Number(e.target.value); state.province = "all"; populateStaticControls(); renderAll(); });
  document.querySelector("#sizeFilter").addEventListener("change", e => { state.size = e.target.value; renderAll(); });
  document.querySelector("#regionFilter").addEventListener("change", e => { state.region = e.target.value; state.province = "all"; updateProvinceOptions(); renderAll(); });
  document.querySelector("#provinceFilter").addEventListener("change", e => { state.province = e.target.value; renderAll(); });
  document.querySelector("#searchFilter").addEventListener("input", e => { state.search = e.target.value.trim().toLowerCase(); renderAll(); });
  document.querySelector("#exportBtn").addEventListener("click", exportExcel);
  document.querySelector("#filterReset").addEventListener("click", () => {
    state.size = "all"; state.region = "all"; state.province = "all"; state.search = ""; state.indicators.clear();
    document.querySelector("#searchFilter").value = "";
    populateIndicatorFilter();
    syncControls(); updateProvinceOptions(); renderAll();
  });
  // Close the indicator dropdown on outside click.
  document.addEventListener("click", e => {
    const ms = document.querySelector("#indicatorFilter");
    if (ms?.open && !ms.contains(e.target)) ms.open = false;
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
