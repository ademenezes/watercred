# Utility Creditworthiness Simulator: workbook and Georgia data analysis

## Executive finding

The workbook is a weighted scorecard, not a statistical credit model. Its primary sheet assigns each of 23 indicators a discrete score from 0 to 4, multiplies that score by a fixed weight, and divides the result by the 400-point maximum. The displayed workbook example produces **196 / 400 = 49.0%**. A separate static cell says 48.5%, which is inconsistent with the live inputs.

Replacing only the example poverty band with Georgia's official 2025 absolute poverty rate of **7.1%** raises the poverty score from 3 to 4 and the total from 196 to **199 / 400 = 49.75%**. This is not yet a Georgia utility credit assessment: 22 of 23 score inputs still need utility-specific evidence.

Source for poverty: [National Statistics Office of Georgia (Geostat), Poverty and Gini Coefficients](https://www.geostat.ge/en/modules/categories/192/living-conditions). The published series reports 7.1% for 2025.

## Workbook structure

### Primary model: “Basis for index score”

The primary sheet contains 23 indicators. Weights total 100; the maximum weighted total is 400.

| Group | Indicators | Total weight |
|---|---|---:|
| Context and operations | Poverty, sanitation coverage, water coverage, NRW, staff/1,000 connections, revenue diversification | 18 |
| Cost structure | Tariff differential, maintenance/OPEX, electricity/OPEX, employee/OPEX, O&M coverage | 18 |
| Financial strength | EBITDA/revenue, cash reserves, liquidity, DSCR, grant dependency, debt/cash, debt/equity | 39 |
| Commercial discipline | Debtor days, reduction in debtor days, bad debt provision, billing efficiency, collection efficiency | 25 |

### Other sheets

- **Values for indicators** defines the 0–4 scoring bands.
- **Merging O&M** combines maintenance, electricity, and employee costs into an 11-weight O&M coverage factor. It has 20 factors and also totals 100, but is not used by the demo.
- **Weight ranking** is not identical to the primary sheet. For example, it gives debt/cash a weight of 10 instead of 9, tariff differential 8 instead of 7, revenue diversification 6 instead of 5, DSCR 5 instead of 7, and liquidity 4 instead of 6. The demo uses the weights attached to the primary model formulas.

## Material definition issues to resolve

1. **Workbook total conflict.** The active factor values produce 49.0, while a static comparison cell reports 48.5.
2. **Average tariff differential conflict.** The definition says highest-versus-lowest tariff; the formula describes `(average tariff − average cost) / average cost`, which is a cost-recovery margin.
3. **Revenue diversification conflict.** The definition says non-tariff revenue share; the formula subtracts institutional/commercial share from residential share. Those are different measures.
4. **Grant dependency conflict.** The definition references CAPEX financed by grants; the formula references OPEX financed by grant income.
5. **Reduction in debtor days sign.** The written formula `(current − previous) / current` is negative when debtor days actually fall, but positive changes receive higher scores. A reduction formula would normally reverse the numerator.
6. **Liquidity units.** Liquidity is defined as cash and near-cash divided by current liabilities but uses the same percentage bands as EBITDA margin, cash reserves, and debtor-day reduction.
7. **Threshold boundaries.** Several bands overlap at their endpoints. Staff/1,000 connections lists `<5`, `6`, `7`, `8`, and `>8`, leaving 5 undefined. Billing and collection bands leave decimal gaps because labels are expressed as integer ranges.
8. **No rating interpretation.** The workbook defines an index score but no credit grades, lending cut-offs, default calibration, or validation sample. The demo's descriptive bands are therefore explicitly non-authoritative.

## Provisional simulator interpretation

The interface uses 60/100 as the minimum indication of potential creditworthiness and 75/100 as an indicative creditworthy profile. Scores below 60 are below the provisional threshold. These bands are decision-support conventions rather than mappings to S&P, Fitch, Moody's, or another external scale. At least 17 of 23 inputs must be evidenced before the indication should be treated as reliable.

## Georgia CSV coverage

`georgia_validated_data.csv` contains **345 observations**, **12 utility IDs**, **9 indicators**, and years **2014–2024**.

| CSV indicator | Workbook input supplied? | Appropriate use |
|---|---|---|
| Average tariff | No—average cost is missing | Operational context; cannot calculate tariff differential/cost recovery |
| Connections | No—staff count is missing | Denominator context; cannot calculate staff/1,000 |
| Metering | No corresponding factor | Operational context |
| Consumption per capita | No corresponding factor | Operational context |
| Continuity | No corresponding factor | Service-quality context |
| Water quality compliance | No corresponding factor | Service-quality context |
| Complaints | No corresponding factor | Complaint intensity per 1,000 connections |
| Investment | No corresponding factor | Investment context; not grant dependency without financing mix |
| Compensation | No corresponding factor | Regulatory/service context |

The CSV does not contain poverty. It also does not contain service coverage, production and billed volumes, staffing, audited OPEX components, revenue mix, average cost, EBITDA, cash, current liabilities, debt service, grants, debt, equity, receivables, bad-debt policy, or collections.

### National operational ranking

The interface ranks utilities separately on five operational measures: continuity (30%), water-quality compliance (25%), metering (20%), complaints per 1,000 connections (15%), and regulatory compensation per connection (10%). Available weights are renormalized, at least three measures are required, and observations older than five years are excluded. Coverage and source-year ranges are displayed because utilities with incomplete evidence are not directly comparable to those with full coverage. This ranking must not be interpreted as the 23-factor creditworthiness score.

## Recommended next evidence package

To turn the simulation into a Georgia utility assessment, collect a consistent utility and fiscal year for:

- audited income statement, balance sheet, and cash-flow statement;
- debt register and annual principal/interest schedule;
- billing, cash collection, receivables aging, write-off, and bad-debt policy data;
- production, billed volume, service population, and sanitation population;
- staffing and connections;
- residential, commercial, institutional, and non-tariff revenue breakdowns;
- tariff schedule plus unit operating cost;
- maintenance, electricity, employee, and total OPEX;
- CAPEX/OPEX grant financing split.

Before filling those values, stakeholders should resolve the definition conflicts above and decide whether the primary or merged O&M structure is canonical.
