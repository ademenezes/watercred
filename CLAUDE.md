# WaterCRED

Dependency-free prototype for water utility creditworthiness analysis. No framework, no build step — plain HTML/CSS/ES6. The **Philippines page is primary**; Georgia is **hidden for now** (unlinked, but preserved and functional).

## Run

```bash
python3 -m http.server 8000
```

A local server is required: the pages fetch CSVs from `data/`, which browsers block from `file://`. `/` redirects to the Philippines page (`/philippines.html`); the hidden Georgia page is `/georgia.html`.

## Architecture

- `core.js` — shared model + the **Georgia** engine. Top level: the canonical 23-factor workbook model (`factors`, `factorDefinitions`, band functions, `workbookPreset`/`upsidePreset`/`stressPreset`), `parseCSV`, `clamp`, `compact`. `initApp(config)` runs the simulator + evidence explorer + ranking — **used by Georgia only now.**
- `philippines.js` — **standalone** app (does NOT call `initApp`). Loads `core.js` for the shared model and `phl-geo.js` for geodata, then renders the ranking, size/region/province filters, province choropleth, and methodology tables itself. Keep changes here; leave `core.js`/`georgia.js` untouched so Georgia stays unchanged.
- `georgia.js` — Georgia country config passed to `initApp` (CSV path, presets, metrics, `scoreUtility`, `onRanking`).
- `phl-geo.js` — static geodata: `PHL_PROVINCES` (geoBoundaries gbOpen PHL ADM2 province polygons, CC-BY 4.0, simplified, `[lon,lat]`), `PHL_PROVINCE_META` (name + region), `PHL_UTILITY_GEO` (utility→province, compiled/approximate). Regeneration provenance in SESSION_LOG.md. (Replaced the old `phl-map.js`.)
- `index.html` is a redirect to `philippines.html`. `styles.css` is shared. Georgia relies on `core.js` element ids (`#factorGrid`, `#rankingBody`, …); the Philippines page uses its own ids (`#sizeFilter`, `#regionFilter`, `#provinceFilter`, `#rankingBody`, `#phlMap`, `#indicatorTable`).

## Methodology invariants

- The 23-factor bands and weights in `core.js` are canonical to the source workbook. The workbook reference preset must score exactly **49.0** — treat that as a regression check on the Georgia simulator after touching scoring. (`philippines.js` reuses the same `factors`.)
- **Never invent data.** Poverty: Geostat 2025 (7.1%) for Georgia, PSA 2023 (15.5%) for the Philippines. The utility→province mapping in `phl-geo.js` is **compiled/approximate** (not an official field) and disclosed as such.
- Philippines ranking = renormalized subset of the 23 factors: `Σ(points×weight) / Σ(4×weight) × 100` over evidenced factors only, minimum **4** factors to rank, observations ≤ **5 years** old, derived ratios (EBITDA, debt/equity, staff) only combine same-year statements. Negative equity scores 0 on leverage; liquidity uses current-ratio bands (documented demo conventions). `FIN_DEBT_TO_EQUITY` is a **bare ratio** in the CSV, so debt/equity is derived from `FIN_TOTAL_LIABILITIES ÷ FIN_EQUITY × 100`, not that column.
- Utility **size** = LWUA category (A ≥30k / B ≥10k / C ≥3k / D <3k connections, DBM/LWUA 2011 manual) from the **median** of a utility's `OPS_CONNECTIONS_TOTAL`; utilities without connection data are "size unknown".
- `normalizeRow` converts "PHP million" → PHP and "million m3" → m³ at load; derived ratios rely on this.
- When changing any threshold or scoring/size/geo rule, update every disclosure in the same commit: the ranking note, method section, and indicator table in `philippines.html`/`philippines.js`, README, and SESSION_LOG.md.

## Data

- `data/georgia_validated_data.csv` — 345 rows, 12 utilities, 2014–2024, 14 columns (GNERC operational metrics).
- `data/philippines_validated.csv` — **52,471 rows, 519 water utilities, 2012–2025**, 22 columns incl. `utility_name`, `unit`, `direction`, `verification_level` (mostly COA Annual Audit/Financial Reports, plus LWUA and Manila Water). Almost entirely financial (`FIN_*`) statements; `OPS_CONNECTIONS_TOTAL` is sparse (~170 utilities).
- `philippines.js` relies on `utility_id, utility_name, year, indicator_id, value, unit, source_institution, verification_level`. Geography is not in the CSV — it comes from `phl-geo.js`.

## Logs

Append a dated entry to `SESSION_LOG.md` for every substantive change (decisions + verification). `MODEL_ANALYSIS.md` is the workbook audit — historical, don't rewrite.
