# Utility Creditworthiness Simulator · Georgia

An interactive, dependency-free prototype that implements the primary 23-factor model in `Creditworthiness index calculation WaterCRED_for Ana and Pavel (002).xlsx` and explores `georgia_validated_data.csv`.

## Features

- Live simulation of all 23 workbook factors with definitions, thresholds, weights, and weighted points.
- Georgia baseline using the official 2025 Geostat absolute poverty rate.
- Scenario presets, reset controls, factor-group filters, and sensitivity ranking.
- Utility/year evidence explorer covering all nine validated CSV indicators.
- National operational evidence ranking with data-coverage and observation-year disclosures.
- Responsive, dependency-free interface that runs from a basic local web server.

## Run it

From this directory:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. A local server is required because browsers block JavaScript from reading the adjacent CSV when `index.html` is opened directly from disk.

## Score interpretation

| Score | Provisional interpretation |
|---:|---|
| 75–100 | Indicatively creditworthy |
| 60–74 | Potentially creditworthy |
| 40–59 | Below threshold |
| 0–39 | High concern |

The provisional minimum is **60/100**. A reliable indication also requires at least **17 of 23 inputs (70%)** to be supported by current evidence. These are simulator conventions, not agency letter ratings, probability-of-default estimates, or lending decisions.

## Baseline and evidence

- The main **Basis for index score** workbook sheet is implemented: 23 factor scores on a 0–4 scale, fixed weights totaling 100, and a 400-point maximum.
- Its displayed factor values calculate to **49.0**, although a separate static cell reports 48.5. The simulator uses the reproducible 49.0 formula result.
- The Georgia starting scenario uses the official 2025 absolute poverty rate of **7.1%** from [Geostat](https://www.geostat.ge/en/modules/categories/192/living-conditions).
- The other 22 starting values reproduce the example responses in the workbook. They are assumptions, not Georgia findings.
- The evidence explorer reads all 345 validated CSV observations. These are kept separate because its nine operational/service indicators do not supply the workbook's financial ratios.
- A national operational evidence ranking compares utilities using continuity, water quality, metering, complaint intensity, and regulatory compensation. It is explicitly separate from the financial creditworthiness index, excludes observations more than five years old, and requires at least three available measures.

## Operational ranking method

The country ranking is separate from the 23-factor financial index. It combines the latest validated observation available through the selected year for:

| Measure | Weight | Direction |
|---|---:|---|
| Continuity | 30% | Higher is better, capped at 24 hours/day |
| Water-quality compliance | 25% | Higher is better |
| Metering | 20% | Higher is better |
| Complaints per 1,000 connections | 15% | Lower is better; zero points at 5 or more |
| Regulatory compensation per connection | 10% | Lower is better; zero points at GEL 5 or more |

Available weights are renormalized. A utility requires at least three measures to be ranked, and observations more than five years old are excluded. Every row discloses measure coverage and source years. The result is an **operational evidence score**, not a financial creditworthiness rating.

## Important model ambiguities

The workbook has overlapping boundary labels, a missing staff value of 5, and percentage bands reused for a liquidity ratio. `app.js` applies deterministic boundary rules and shows the assigned band beside every input. The alternate **Merging O&M** sheet is not used.

Before using this for investment decisions, replace assumed values with audited utility evidence and have the factor definitions, thresholds, weights, and rating interpretation reviewed by project stakeholders.

## Project files

- `index.html` — application structure and explanatory content
- `styles.css` — responsive presentation
- `app.js` — factor scoring, simulation, CSV aggregation, and utility ranking
- `MODEL_ANALYSIS.md` — workbook audit, data coverage, and methodology issues
- `SESSION_LOG.md` — implementation decisions and verification record
