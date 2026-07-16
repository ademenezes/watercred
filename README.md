# WaterCRED

An interactive, dependency-free prototype that implements the primary 23-factor creditworthiness model in `Creditworthiness index calculation WaterCRED_for Ana and Pavel (002).xlsx` and explores validated country datasets. Two country pages share one engine:

- **`index.html` — Georgia**: 23-factor simulator plus an operational evidence explorer and ranking over `data/georgia_validated_data.csv` (345 observations · 12 utilities · 2014–2024, GNERC).
- **`philippines.html` — Philippines**: the same simulator plus an evidence explorer and an **evidence-based creditworthiness ranking** over `data/philippines_validated.csv` (1,610 observations · 57 water districts · 2009–2024, COA/LWUA).

## Features

- Live simulation of all 23 workbook factors with definitions, thresholds, weights, and weighted points.
- Country baselines: Georgia seeds the official 2025 Geostat poverty rate; the Philippines seeds PSA's 2023 poverty incidence (15.5%) and five COA/LWUA portfolio medians.
- Scenario presets, reset controls, factor-group filters, and sensitivity ranking.
- Utility/year evidence explorer with portfolio aggregation (sums, connection-weighted ratios).
- National utility rankings with data-coverage and observation-year disclosures on every row.
- Philippines district map: municipal boundary polygons (GADM 4.1) colored by rating band, clickable into the evidence explorer.
- Responsive, dependency-free interface that runs from a basic local web server.

## Run it

From this directory:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> (Georgia) or <http://localhost:8000/philippines.html>. A local server is required because browsers block JavaScript from reading the adjacent CSVs when the pages are opened directly from disk.

## Score interpretation

| Score | Provisional interpretation |
|---:|---|
| 75–100 | Indicatively creditworthy |
| 60–74 | Potentially creditworthy |
| 40–59 | Below threshold |
| 0–39 | High concern |

The provisional minimum is **60/100**. A reliable indication also requires at least **17 of 23 inputs (70%)** to be supported by current evidence. These are simulator conventions, not agency letter ratings, probability-of-default estimates, or lending decisions.

## Philippines creditworthiness ranking method

Each water district is scored on whichever of the 23 workbook factors its validated data supports, using the workbook's own 0–4 bands, and weights are renormalized to the available factors:

```
score = Σ(points × weight) ÷ Σ(4 × weight) × 100
```

Up to nine factors can be evidenced per utility:

| Factor | Source |
|---|---|
| O&M coverage | `FIN_COST_COVERAGE` |
| Collection efficiency | `FIN_COLLECTION_EFFICIENCY` |
| Non-revenue water | `OPS_NRW_PCT` |
| Electricity costs / OPEX | `FIN_ENERGY_COST_SHARE` |
| Employee costs / OPEX | `FIN_STAFF_COST_SHARE` |
| Liquidity | `FIN_CURRENT_LIQUIDITY`, scored with current-ratio bands (demo convention) |
| EBITDA / revenue | `FIN_EBITDA_MARGIN`, or derived: (net income + depreciation + interest − non-operating income) ÷ revenue |
| Debt to equity | `FIN_TOTAL_LIABILITIES` ÷ `FIN_EQUITY`; negative equity scores 0 directly |
| Staff / 1,000 connections | employees ÷ connections, or 1,000 ÷ connections-per-staff |

At least **four** evidenced factors are required to rank. Observations more than five years old (relative to the selected year) are excluded, and derived ratios only combine same-year financial statements (PHP-million rows are normalized to PHP at load). The result is a **relative, renormalized indication**, not the full 23-factor index and not a credit rating.

## Georgia operational ranking method

The Georgia ranking is separate from the financial index. It combines the latest validated observation available through the selected year for: continuity (30%), water-quality compliance (25%), metering (20%), complaints per 1,000 connections (15%, lower is better), and regulatory compensation per connection (10%, lower is better). Available weights are renormalized; at least three measures are required; observations more than five years old are excluded. The result is an **operational evidence score**, not a financial creditworthiness rating.

## Important model ambiguities

The workbook has overlapping boundary labels, a missing staff value of 5, and percentage bands reused for a liquidity ratio. `core.js` applies deterministic boundary rules and shows the assigned band beside every input; the Philippines ranking scores liquidity with current-ratio bands instead. The alternate **Merging O&M** sheet is not used. Its displayed factor values calculate to **49.0**, although a separate static cell reports 48.5; the simulator uses the reproducible 49.0 formula result.

Before using this for investment decisions, replace assumed values with audited utility evidence and have the factor definitions, thresholds, weights, and rating interpretation reviewed by project stakeholders.

## Project files

- `index.html` / `philippines.html` — country pages
- `core.js` — shared engine: factor model, simulation, CSV parsing, aggregation, ranking renderer
- `georgia.js` / `philippines.js` — country configs: data paths, presets, metrics, ranking scorers
- `phl-map.js` — Philippines geodata: Natural Earth 50m country outline, GADM 4.1 district polygons
- `styles.css` — responsive presentation
- `data/` — validated country CSVs
- `MODEL_ANALYSIS.md` — workbook audit, data coverage, and methodology issues
- `SESSION_LOG.md` — implementation decisions and verification record
