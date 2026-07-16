"use strict";

(() => {
  // Portfolio medians of each utility's latest observation up to 2023
  // (data/philippines_validated.csv, COA/LWUA audited figures). Recompute:
  // per indicator, take each utility's most recent value ≤2023, then the median.
  const PHL_POVERTY = 15.5;            // PSA · 2023 Full Year Official Poverty Statistics
  const MEDIAN_COST_COVERAGE = 106.1;  // FIN_COST_COVERAGE, n=36
  const MEDIAN_NRW = 22.0;             // OPS_NRW_PCT, n=21
  const MEDIAN_STAFF_COST_SHARE = 43.8; // FIN_STAFF_COST_SHARE, n=26
  const MEDIAN_ENERGY_COST_SHARE = 1.8; // FIN_ENERGY_COST_SHARE, n=17 (many gravity-fed districts report ~0%)
  const MEDIAN_COLLECTION = 96.7;      // FIN_COLLECTION_EFFICIENCY, n=7

  const MIN_RANKED_FACTORS = 4;
  const MAX_AGE = 5;

  const money = value => `₱${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

  // Manila Water reports some statements in PHP million / million m³; normalize
  // at load so sums and derived ratios never mix magnitudes.
  const normalizeRow = row => {
    if (row.unit === "PHP million") return { ...row, value: row.value * 1e6, unit: "PHP" };
    if (row.unit === "million m3") return { ...row, value: row.value * 1e6, unit: "m3" };
    return row;
  };

  const metrics = [
    { id: "OPS_CONNECTIONS_TOTAL", label: "Connections", unit: "connections", format: v => compact(v), aggregate: "sum" },
    { id: "FIN_COST_COVERAGE", label: "O&M cost coverage", unit: "%", format: v => `${Number(v).toFixed(1)}%`, aggregate: "weighted" },
    { id: "FIN_COLLECTION_EFFICIENCY", label: "Collection efficiency", unit: "%", format: v => `${Number(v).toFixed(1)}%`, aggregate: "weighted" },
    { id: "OPS_NRW_PCT", label: "Non-revenue water", unit: "%", format: v => `${Number(v).toFixed(1)}%`, aggregate: "weighted" },
    { id: "FIN_TARIFF_AVG", label: "Average tariff", unit: "PHP / m³", format: v => Number(v).toFixed(2), aggregate: "weighted" },
    { id: "FIN_REVENUE", label: "Revenue", unit: "PHP", format: money, aggregate: "sum" },
    { id: "FIN_NET_INCOME", label: "Net income", unit: "PHP", format: money, aggregate: "sum" },
    { id: "OPS_POPULATION_SERVED", label: "Population served", unit: "people", format: v => compact(v), aggregate: "sum" },
    { id: "INST_PRODUCTIVITY_CONN_PER_STAFF", label: "Staff productivity", unit: "connections / staff", format: v => Number(v).toFixed(0), aggregate: "weighted" },
    { id: "SQ_WATER_QUALITY_OVERALL", label: "Water quality compliance", unit: "%", format: v => `${Number(v).toFixed(1)}%`, aggregate: "weighted" }
  ];

  const factorById = Object.fromEntries(factors.map(f => [f.id, f]));

  // The workbook scores liquidity with EBITDA-style % bands despite defining it
  // as a ratio (a documented workbook ambiguity). FIN_CURRENT_LIQUIDITY is a
  // current ratio, so the ranking uses dedicated ratio bands instead.
  const currentRatioScore = v => v >= 2 ? [4,"≥2.0×"] : v >= 1.5 ? [3,"1.5–2.0×"] : v >= 1.2 ? [2,"1.2–1.5×"] : v >= 1 ? [1,"1.0–1.2×"] : [0,"<1.0×"];

  // Latest year ≤ selected year (within MAX_AGE) at which every required
  // indicator has an observation — derived ratios never mix statement years.
  function latestConsistentSet(obs, utilityId, requiredIds, optionalIds, year) {
    for (let y = year; y >= year - MAX_AGE; y--) {
      const values = new Map();
      obs.forEach(r => {
        if (r.utility_id === utilityId && r.year === y && !values.has(r.indicator_id)
          && (requiredIds.includes(r.indicator_id) || optionalIds.includes(r.indicator_id))) {
          values.set(r.indicator_id, r.value);
        }
      });
      if (requiredIds.every(id => values.has(id))) return { values, year: y };
    }
    return null;
  }

  const direct = indicatorId => (utilityId, year, helpers) => {
    const observation = helpers.latestObservation(utilityId, indicatorId, year, MAX_AGE);
    return observation ? { value: observation.value, years: [observation.year] } : null;
  };

  function ebitdaMargin(utilityId, year, helpers) {
    const reported = direct("FIN_EBITDA_MARGIN")(utilityId, year, helpers);
    if (reported) return reported;
    const set = latestConsistentSet(helpers.observations(), utilityId,
      ["FIN_NET_INCOME", "FIN_DEPRECIATION", "FIN_INTEREST_EXPENSE", "FIN_REVENUE"], ["FIN_NONOP_INCOME"], year);
    if (!set) return null;
    const revenue = set.values.get("FIN_REVENUE");
    if (revenue <= 0) return null;
    const ebitda = set.values.get("FIN_NET_INCOME") + set.values.get("FIN_DEPRECIATION")
      + set.values.get("FIN_INTEREST_EXPENSE") - (set.values.get("FIN_NONOP_INCOME") ?? 0);
    return { value: ebitda / revenue * 100, years: [set.year] };
  }

  function debtEquity(utilityId, year, helpers) {
    const set = latestConsistentSet(helpers.observations(), utilityId, ["FIN_TOTAL_LIABILITIES", "FIN_EQUITY"], [], year);
    if (!set) return null;
    const equity = set.values.get("FIN_EQUITY");
    // Negative or zero equity: leverage is worse than any workbook band — score 0 directly.
    if (equity <= 0) return { points: 0, years: [set.year] };
    return { value: set.values.get("FIN_TOTAL_LIABILITIES") / equity * 100, years: [set.year] };
  }

  function staffPerThousand(utilityId, year, helpers) {
    const obs = helpers.observations();
    for (const employeeId of ["INST_TOTAL_EMPLOYEES", "INST_PERMANENT_EMPLOYEES"]) {
      const set = latestConsistentSet(obs, utilityId, [employeeId, "OPS_CONNECTIONS_TOTAL"], [], year);
      if (set && set.values.get("OPS_CONNECTIONS_TOTAL") > 0) {
        return { value: set.values.get(employeeId) / set.values.get("OPS_CONNECTIONS_TOTAL") * 1000, years: [set.year] };
      }
    }
    const productivity = direct("INST_PRODUCTIVITY_CONN_PER_STAFF")(utilityId, year, helpers);
    if (productivity && productivity.value > 0) return { value: 1000 / productivity.value, years: productivity.years };
    return null;
  }

  const phlFactorInputs = [
    { factorId: "om_coverage", compute: direct("FIN_COST_COVERAGE") },
    { factorId: "collection_efficiency", compute: direct("FIN_COLLECTION_EFFICIENCY") },
    { factorId: "nrw", compute: direct("OPS_NRW_PCT") },
    { factorId: "electricity", compute: direct("FIN_ENERGY_COST_SHARE") },
    { factorId: "employee", compute: direct("FIN_STAFF_COST_SHARE") },
    { factorId: "liquidity", compute: direct("FIN_CURRENT_LIQUIDITY"), score: currentRatioScore },
    { factorId: "ebitda", compute: ebitdaMargin },
    { factorId: "debt_equity", compute: debtEquity },
    { factorId: "staff", compute: staffPerThousand }
  ];

  // Renormalized creditworthiness indication: score the factors the utility's
  // validated data supports with the workbook's 0–4 bands, then
  // score = Σ(points × weight) / Σ(4 × weight) × 100 over available factors.
  function scoreUtilityCredit(utilityId, year, helpers) {
    let points = 0, maxPoints = 0, available = 0;
    const years = [];
    phlFactorInputs.forEach(entry => {
      const result = entry.compute(utilityId, year, helpers);
      if (!result) return;
      const factor = factorById[entry.factorId];
      const factorPoints = result.points ?? (entry.score ?? factor.score)(result.value)[0];
      points += factorPoints * factor.weight;
      maxPoints += 4 * factor.weight;
      available++;
      years.push(...result.years);
    });
    const score = maxPoints ? points / maxPoints * 100 : 0;
    const ranked = available >= MIN_RANKED_FACTORS;
    const uniqueYears = [...new Set(years)].sort((a,b) => a-b);
    const yearRange = uniqueYears.length ? (uniqueYears.length === 1 ? `Data year ${uniqueYears[0]}` : `Data years ${uniqueYears[0]}–${uniqueYears.at(-1)}`) : "";
    const confidence = available >= 8 ? "High coverage" : available >= 6 ? "Medium coverage" : available >= MIN_RANKED_FACTORS ? "Low coverage" : "Unranked";
    return { id: utilityId, name: helpers.utilityName(utilityId), score, available, ranked, yearRange, confidence, coverageLabel: `${available}/23 factors` };
  }

  // --- District map ---------------------------------------------------------
  // Equirectangular projection over the outline bounds, with the longitude
  // axis compressed by cos(mid-latitude) so distances read roughly true.
  const MAP = { minLon: 116.97, maxLon: 126.593, minLat: 5.06, maxLat: 20.841, pad: 14, height: 940 };
  MAP.scale = (MAP.height - 2 * MAP.pad) / (MAP.maxLat - MAP.minLat);
  MAP.lonScale = MAP.scale * Math.cos((MAP.minLat + MAP.maxLat) / 2 * Math.PI / 180);
  MAP.width = Math.round((MAP.maxLon - MAP.minLon) * MAP.lonScale + 2 * MAP.pad);
  const project = (lat, lon) => [
    MAP.pad + (lon - MAP.minLon) * MAP.lonScale,
    MAP.pad + (MAP.maxLat - lat) * MAP.scale
  ];

  const RATING_BANDS = [
    { min: 75, label: "Creditworthy (75–100)", color: "#44a892" },
    { min: 60, label: "Potentially creditworthy (60–74)", color: "#7ea66c" },
    { min: 40, label: "Below threshold (40–59)", color: "#e0a84c" },
    { min: 0, label: "High concern (0–39)", color: "#bc624e" }
  ];
  const UNRANKED_COLOR = "#b7c0ba";
  const bandFor = row => row.ranked ? RATING_BANDS.find(b => row.score >= b.min) : null;

  const districtPaths = {};
  const districtPath = id => districtPaths[id] ??= PHL_DISTRICTS[id].map(ring =>
    `M${ring.map(([lon, lat]) => project(lat, lon).map(v => v.toFixed(1)).join(",")).join("L")}Z`).join("");

  let mapReady = false;
  function renderMap(rows, year, select) {
    const svg = document.querySelector("#phlMap");
    if (!svg) return;
    if (!mapReady) {
      svg.setAttribute("viewBox", `0 0 ${MAP.width} ${MAP.height}`);
      const outline = PHL_OUTLINE.map(poly =>
        `<path class="map-land" d="M${poly.map(([lon, lat]) => project(lat, lon).map(v => v.toFixed(1)).join(",")).join("L")}Z"/>`).join("");
      svg.innerHTML = `<g>${outline}</g><g id="mapDistricts"></g>`;
      document.querySelector("#mapLegend").innerHTML = [...RATING_BANDS.map(b =>
        `<span><i style="background:${b.color}"></i>${b.label}</span>`),
        `<span><i style="background:${UNRANKED_COLOR}"></i>Unranked (insufficient evidence)</span>`].join("");
      mapReady = true;
    }
    const located = rows.filter(r => PHL_DISTRICTS[r.id]);
    const shapes = [...located.filter(r => !r.ranked), ...located.filter(r => r.ranked)].map(row => {
      const band = bandFor(row);
      const color = band ? band.color : UNRANKED_COLOR;
      const detail = band ? `${row.score.toFixed(1)} · ${band.label}` : "Unranked";
      return `<path d="${districtPath(row.id)}" fill="${color}" stroke="${color}"
        class="map-district ${row.ranked ? "" : "map-district-unranked"}" data-map-utility="${row.id}" tabindex="0" role="button"
        aria-label="${row.name}: ${detail}"><title>${row.name} — ${detail} (${row.coverageLabel}, ${year})</title></path>`;
    }).join("");
    svg.querySelector("#mapDistricts").innerHTML = shapes;
    svg.querySelectorAll("[data-map-utility]").forEach(shape => {
      const activate = () => {
        document.querySelector("#utilitySelect").value = shape.dataset.mapUtility;
        select();
      };
      shape.addEventListener("click", activate);
      shape.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
    });
  }

  initApp({
    csvPath: "data/philippines_validated.csv",
    defaultYear: 2023,
    defaultPreset: "philippines",
    portfolioLabel: "the Philippines portfolio",
    evidencedIds: new Set(["poverty", "om_coverage", "nrw", "employee", "electricity", "collection_efficiency"]),
    evidencedInputs: 6,
    minEvidencedInputs: 17,
    sources: {
      poverty: "PSA · 2023",
      om_coverage: "COA/LWUA portfolio median",
      nrw: "COA/LWUA portfolio median",
      employee: "COA/LWUA portfolio median",
      electricity: "COA/LWUA portfolio median",
      collection_efficiency: "COA/LWUA portfolio median"
    },
    presets: {
      philippines: {
        ...workbookPreset,
        poverty: PHL_POVERTY,
        om_coverage: MEDIAN_COST_COVERAGE,
        nrw: MEDIAN_NRW,
        employee: MEDIAN_STAFF_COST_SHARE,
        electricity: MEDIAN_ENERGY_COST_SHARE,
        collection_efficiency: MEDIAN_COLLECTION
      },
      workbook: workbookPreset,
      upside: upsidePreset,
      stress: stressPreset
    },
    normalizeRow,
    metrics,
    scoreUtility: scoreUtilityCredit,
    onRanking: renderMap
  });
})();
