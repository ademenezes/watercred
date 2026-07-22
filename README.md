# WaterCRED

An interactive, dependency-free prototype that implements the primary 23-factor creditworthiness model in `Creditworthiness index calculation WaterCRED_for Ana and Pavel (002).xlsx` and applies it to validated Philippine water-utility data.

- **`philippines.html` — Philippines (the landing page)**: an **evidence-based creditworthiness ranking** of 519 water utilities over `data/philippines_validated.csv` (52,471 observations · 2012–2025, COA/LWUA/Manila Water audited financials), with size and geography **filters**, a **provincial choropleth map**, and a full **methodology + 23-indicator reference**.
- **`georgia.html` — Georgia (hidden for now)**: the original 23-factor simulator, evidence explorer, and operational ranking over `data/georgia_validated_data.csv` (345 observations · 12 utilities · 2014–2024, GNERC). Not linked from the site; open it directly if needed. `index.html` redirects to the Philippines page.

## Features

- **Creditworthiness ranking** of 519 utilities, scored on whichever of the 23 workbook factors each utility's audited data supports (renormalized weights).
- **Filters** beside the ranking: free-text **search** (utility, province or region, with name autocomplete), utility **size** (official LWUA categories), **region** (admin 1), **province** (admin 2), an **indicator multi-select** (show only utilities with evidence for every selected factor), and the "through year" cut-off (defaults to 2025, the latest data year).
- **Export to Excel**: downloads the currently filtered ranking as a real `.xlsx` workbook (generated in the browser, no dependencies) with three sheets — the ranking summary, the per-utility factor detail (value, band, weight, source), and export notes recording the active filters and methodology caveats.
- **Provincial choropleth**: each province shaded by the median creditworthiness of its ranked utilities, reacting to the filters; click a province to filter the ranking to it.
- **Data coverage**: alongside the per-factor coverage table, a "which indicators appear in the source reports?" table lists all raw dataset indicators, most common first, with how many of the 519 utilities report each, observation counts and year spans; indicators feeding the ranking are flagged.
- **Methodology section**: the index formula, score bands, the LWUA size definition, and a reference table of all 23 indicators — definition, formula, weight, 0–4 score bands, and typical source — with the nine ranking-eligible factors flagged.
- Per-utility factor breakdowns on every ranking row (value, band, weight, data year, source institution).
- Responsive, dependency-free interface that runs from a basic local web server.

## Run it

From this directory:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> (redirects to the Philippines page). The hidden Georgia page is <http://localhost:8000/georgia.html>. A local server is required because browsers block JavaScript from reading the adjacent CSVs when the pages are opened directly from disk.

## Score interpretation

| Score | Provisional interpretation |
|---:|---|
| 75–100 | Indicatively creditworthy |
| 60–74 | Potentially creditworthy |
| 40–59 | Below threshold |
| 0–39 | High concern |

The provisional minimum is **60/100**. A reliable indication also requires at least **17 of 23 inputs (70%)** to be supported by current evidence. These are demo conventions, not agency letter ratings, probability-of-default estimates, or lending decisions.

## Creditworthiness ranking method

Each utility is scored on whichever of the 23 workbook factors its validated data supports, using the workbook's own 0–4 bands, and weights are renormalized to the available factors:

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
| Debt to equity | `FIN_TOTAL_LIABILITIES` ÷ `FIN_EQUITY` × 100; negative equity scores 0 directly |
| Staff / 1,000 connections | employees ÷ connections, or 1,000 ÷ connections-per-staff |

At least **four** evidenced factors are required to rank. Observations more than five years old (relative to the selected year) are excluded, and derived ratios only combine same-year financial statements (PHP-million rows are normalized to PHP at load). The result is a **relative, renormalized indication**, not the full 23-factor index and not a credit rating. Only **ranked** utilities are listed (those with ≥4 evidenced factors at the selected year); the rest are omitted. Rank shown is the national position; filters narrow the list without re-ranking.

Every ranking row expands to a per-utility factor breakdown: absolute value, 0–4 band points, weight, weighted points, data year, and source institution (COA, LWUA or Manila Water, with verification level and a derived-ratio note where applicable); unavailable factors are listed as missing. The collapsible indicator-coverage table beneath the ranking reports, for each of the nine evidence-eligible factors, how many utilities have a usable observation at the selected year — computed with the exact recency and same-year rules the ranking applies — split by source institution.

## Utility size — official LWUA categories

Size uses the Local Water District categories from the DBM/LWUA *Revised Manual on Categorization* (2011), by number of active service connections:

| Category | Label | Active service connections |
|---|---|---|
| A | Very large | ≥ 30,000 |
| B | Large | 10,000–29,999 |
| C | Medium | 3,000–9,999 |
| D | Small | < 3,000 |

Each utility is classified from the **median** of its reported connection counts (COA/LWUA), which dampens single-year reporting spikes. Only utilities that report connections can be sized (~170 of 519); the rest appear as *size unknown*.

## Geography (regions, provinces, map)

The validated CSV has no geographic field, so each utility is mapped to a **province (admin 2)** and **region (admin 1)** via a **compiled, approximate** lookup derived from utility names, the PSGC 2019 gazetteer, and LWUA/COA records — not an official field. A small number of same-name districts may be placed in the wrong province. Province boundaries are from [geoBoundaries](https://www.geoboundaries.org) gbOpen PHL ADM2 (CC-BY 4.0), simplified (Douglas–Peucker ~1 km, 3-decimal quantization) and stored inline in `phl-geo.js`.

## Georgia (hidden)

The Georgia page keeps the original 23-factor simulator, evidence explorer, and a separate **operational** ranking (continuity 30%, water-quality 25%, metering 20%, complaints 15%, regulatory compensation 10%; renormalized, ≥3 measures, ≤5-year recency). It is unlinked while the project focuses on the Philippines but remains functional at `georgia.html`.

## Important model ambiguities

The workbook has overlapping boundary labels, a missing staff value of 5, and percentage bands reused for a liquidity ratio. `core.js` applies deterministic boundary rules; the Philippines ranking scores liquidity with current-ratio bands instead. The alternate **Merging O&M** sheet is not used. The workbook's displayed factor values calculate to **49.0**, although a separate static cell reports 48.5; the model uses the reproducible 49.0 formula result (verified as a regression check on the Georgia simulator).

Before using this for investment decisions, replace assumed values with audited utility evidence, resolve the compiled utility→province mapping against authoritative records, and have the factor definitions, thresholds, weights, and rating interpretation reviewed by project stakeholders.

## Project files

- `philippines.html` — Philippines page (ranking + filters + map + methodology); `index.html` redirects here
- `georgia.html` — hidden Georgia simulator page
- `core.js` — shared model (23 factors, bands, weights, presets) + `parseCSV` + the Georgia `initApp` engine
- `philippines.js` — standalone Philippines app: ranking scorer, LWUA size classification, filters, province choropleth, methodology tables
- `georgia.js` — Georgia country config for `initApp`
- `phl-geo.js` — province (admin 2) polygons + `utility → province → region` mapping (geoBoundaries CC-BY 4.0; PSGC 2019)
- `styles.css` — responsive presentation
- `data/` — validated country CSVs
- `MODEL_ANALYSIS.md` — workbook audit, data coverage, and methodology issues
- `SESSION_LOG.md` — implementation decisions and verification record
