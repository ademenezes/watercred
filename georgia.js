"use strict";

(() => {
  const GEORGIA_POVERTY = 7.1;

  const names = {
    GEO_GNERC_BATUMI: "Batumi Water", GEO_GNERC_GWP: "Georgian Water and Power", GEO_GNERC_GWP_MTSKHETA: "GWP Mtskheta",
    GEO_GNERC_KOBULETI: "Kobuletis Tskali", GEO_GNERC_MARNEULI: "Marneulis Soptskali", GEO_GNERC_MTSKHETA: "Mtskhetis Tskali",
    GEO_GNERC_RUSTAVI: "Rustavi Water", GEO_GNERC_SACHKHERE: "Sachkheris Tskalkanali", GEO_GNERC_SAGAREJO: "Sagarejo",
    GEO_GNERC_SOGURI: "Soguri", GEO_GNERC_UNITED_WATER_COMPANY: "United Water Company", GEO_GNERC_UWSCG: "UWSCG"
  };
  const canonicalUtility = id => names[id] || id;

  const money = value => `₾${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

  const metrics = [
    { id: "OPS_CONNECTIONS_TOTAL", label: "Connections", unit: "connections", format: v => compact(v), aggregate: "sum" },
    { id: "FIN_TARIFF_AVG", label: "Average tariff", unit: "GEL / m³", format: v => Number(v).toFixed(3), aggregate: "weighted" },
    { id: "OPS_METERING_PCT", label: "Metering", unit: "% of customers", format: v => `${Number(v).toFixed(1)}%`, aggregate: "weighted" },
    { id: "SQ_CONTINUITY", label: "Continuity", unit: "hours / day", format: v => Number(v).toFixed(1), aggregate: "weighted" },
    { id: "SQ_WATER_QUALITY_OVERALL", label: "Water quality compliance", unit: "%", format: v => `${Number(v).toFixed(2)}%`, aggregate: "weighted" },
    { id: "OPS_CONSUMPTION_PERCAPITA", label: "Consumption", unit: "L / person / day", format: v => Number(v).toFixed(0), aggregate: "weighted" },
    { id: "FIN_INVESTMENT_TOTAL", label: "Investment", unit: "GEL", format: money, aggregate: "sum" },
    { id: "FIN_COMPENSATION_TOTAL", label: "Regulatory compensation", unit: "GEL", format: money, aggregate: "sum" },
    { id: "SQ_COMPLAINTS_TOTAL", label: "Complaint intensity", unit: "per 1,000 connections", format: v => Number(v).toFixed(2), aggregate: "complaintRate" }
  ];

  const rankingMetrics = [
    { id: "SQ_CONTINUITY", weight: 30, score: value => clamp(value / 24 * 100) },
    { id: "SQ_WATER_QUALITY_OVERALL", weight: 25, score: value => clamp(value) },
    { id: "OPS_METERING_PCT", weight: 20, score: value => clamp(value) },
    { id: "SQ_COMPLAINTS_TOTAL", weight: 15, rate: true, score: value => clamp(100 - value / 5 * 100) },
    { id: "FIN_COMPENSATION_TOTAL", weight: 10, rate: true, score: value => clamp(100 - value / 5 * 100) }
  ];

  function scoreUtilityOperations(utilityId, year, helpers) {
    const name = helpers.utilityName(utilityId);
    const connection = helpers.latestObservation(utilityId, "OPS_CONNECTIONS_TOTAL", year, 5);
    const scored = [];
    const years = [];
    rankingMetrics.forEach(metric => {
      const observation = helpers.latestObservation(utilityId, metric.id, year, 5);
      if (!observation) return;
      let input = observation.value;
      if (metric.rate) {
        if (!connection || !connection.value) return;
        input = metric.id === "SQ_COMPLAINTS_TOTAL"
          ? observation.value / connection.value * 1000
          : observation.value / connection.value;
        years.push(connection.year);
      }
      scored.push({ weight: metric.weight, value: metric.score(input) });
      years.push(observation.year);
    });
    const weight = scored.reduce((sum,item) => sum + item.weight, 0);
    const score = weight ? scored.reduce((sum,item) => sum + item.value * item.weight, 0) / weight : 0;
    const available = scored.length;
    const ranked = available >= 3;
    const uniqueYears = [...new Set(years)].sort((a,b) => a-b);
    const yearRange = uniqueYears.length ? (uniqueYears.length === 1 ? `Data year ${uniqueYears[0]}` : `Data years ${uniqueYears[0]}–${uniqueYears.at(-1)}`) : "";
    const confidence = available >= 5 ? "High coverage" : available === 4 ? "Medium coverage" : available === 3 ? "Low coverage" : "Unranked";
    return { id: utilityId, name, score, available, ranked, yearRange, confidence, coverageLabel: `${available}/5 measures` };
  }

  initApp({
    csvPath: "data/georgia_validated_data.csv",
    defaultYear: 2024,
    defaultPreset: "georgia",
    portfolioLabel: "the Georgia portfolio",
    evidencedIds: new Set(["poverty"]),
    evidencedInputs: 1,
    minEvidencedInputs: 17,
    sources: { poverty: "Geostat · 2025" },
    presets: {
      georgia: { ...workbookPreset, poverty: GEORGIA_POVERTY },
      workbook: workbookPreset,
      upside: upsidePreset,
      stress: stressPreset
    },
    utilityName: canonicalUtility,
    metrics,
    scoreUtility: scoreUtilityOperations
  });
})();
