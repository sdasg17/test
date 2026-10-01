/**
 * Risk model
 *
 * The chain, in order:
 *
 *   1. Trend adjustment   shift every past year to today's climate level
 *   2. Event counting     turn daily temperature into trigger events per year
 *   3. Fitted frequency   a count distribution, so the tail can be read off
 *   4. Price              premium set so the combined ratio hits the target
 *   5. Capital check      1-in-200 year loss and the return it earns
 *
 * Because payouts are fixed by contract there is no damage to model. The only
 * uncertainty is how often the trigger fires.
 */

import { DailySeries, ModelSeries, BASELINE, FUTURE } from './ClimateData';

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

export interface Assumptions {
  targetCombinedRatio: number;  // claims plus expenses as a share of premium
  expenseRatio: number;         // expenses as a share of premium, at the reference book size
  referencePolicies: number;    // the book size the expense ratio above refers to
  volumeDiscountPerDoubling: number; // percentage points off the expense ratio per doubling
  heatThreshold: number;       // daily maximum at or above, degC
  heatDuration: number;        // consecutive days for one heat event
  coldThreshold: number;       // daily mean at or below, degC
  coldDuration: number;        // consecutive days per cold event
  heatPayout: number;          // fixed payout per heat payout-block
  coldPayout: number;          // fixed payout per cold payout-block
  annualLimit: number;         // maximum events paid per peril per year
  adoption: number;            // share of population holding a policy
}

/**
 * Defaults. The triggers come from official UK definitions rather than
 * judgement: the Met Office heatwave definition (three days at or above
 * 28 degC for Greater London) and the Cold Weather Payment trigger (seven
 * consecutive days with mean temperature at or below 0 degC).
 */
export const DEFAULTS: Assumptions = {
  targetCombinedRatio: 0.85,
  expenseRatio: 0.3,
  referencePolicies: 10000,
  volumeDiscountPerDoubling: 0,
  heatThreshold: 28,
  heatDuration: 3,
  coldThreshold: 0,
  coldDuration: 7,
  heatPayout: 100,
  coldPayout: 100,
  annualLimit: 3,
  adoption: 0.01,
};

// ---------------------------------------------------------------------------
// 1. Trend adjustment
// ---------------------------------------------------------------------------

const yearOf = (d: string) => parseInt(d.slice(0, 4), 10);
const monthOf = (d: string) => parseInt(d.slice(5, 7), 10);

export interface TrendResult {
  adjusted: Array<number | null>;
  slopePerDecade: number;
}

/**
 * Removes the linear trend in the seasonal mean of a variable, shifting each
 * year's daily values so every year reflects the climate of the final year.
 * Uses the season that matters for the peril: summer for heat, winter for
 * cold, since the two seasons do not warm at the same rate.
 */
export function detrend(
  dates: string[],
  values: Array<number | null>,
  months: number[]
): TrendResult {
  const acc = new Map<number, { s: number; n: number }>();
  dates.forEach((d, i) => {
    const v = values[i];
    if (v === null || v === undefined || !isFinite(v)) return;
    if (!months.includes(monthOf(d))) return;
    const y = yearOf(d);
    const a = acc.get(y) ?? { s: 0, n: 0 };
    a.s += v;
    a.n += 1;
    acc.set(y, a);
  });

  const years = Array.from(acc.keys())
    .filter(y => (acc.get(y)?.n ?? 0) >= 20)
    .sort((a, b) => a - b);

  if (years.length < 5) return { adjusted: values.slice(), slopePerDecade: 0 };

  const ys = years.map(y => acc.get(y)!.s / acc.get(y)!.n);
  const xbar = years.reduce((a, b) => a + b, 0) / years.length;
  const ybar = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  years.forEach((x, i) => {
    num += (x - xbar) * (ys[i] - ybar);
    den += (x - xbar) ** 2;
  });
  const slope = den > 0 ? num / den : 0;
  const ref = years[years.length - 1];

  const adjusted = values.map((v, i) => {
    if (v === null || v === undefined || !isFinite(v)) return null;
    return v + slope * (ref - yearOf(dates[i]));
  });

  return { adjusted, slopePerDecade: slope * 10 };
}

// ---------------------------------------------------------------------------
// 2. Event counting
// ---------------------------------------------------------------------------

/**
 * Counts payouts per calendar year.
 *
 * Both perils pay per completed run, following the Cold Weather Payment rule:
 * every full block of the required length inside a spell pays again, so six
 * consecutive qualifying days at a three day trigger pay twice.
 *
 * The Met Office would call that one heatwave, but that is a meteorological
 * definition rather than a payout rule. Someone unable to work for six days
 * has lost roughly twice what three days costs, so paying by duration is the
 * more defensible contract and it keeps both perils consistent.
 *
 * A payout is assigned to the year in which it qualifies.
 */
export function countEvents(
  dates: string[],
  values: Array<number | null>,
  meets: (v: number) => boolean,
  duration: number,
  rule: 'perBlock',
  startYear: number,
  endYear: number
): Map<number, number> {
  const counts = new Map<number, number>();
  for (let y = startYear; y <= endYear; y++) counts.set(y, 0);

  let run = 0;
  dates.forEach((d, i) => {
    const v = values[i];
    const ok = v !== null && v !== undefined && isFinite(v) && meets(v);
    if (!ok) {
      run = 0;
      return;
    }
    run += 1;
    const y = yearOf(d);
    if (!counts.has(y)) return;
    const qualifies = run % duration === 0;
    if (qualifies) counts.set(y, (counts.get(y) ?? 0) + 1);
  });

  return counts;
}

// ---------------------------------------------------------------------------
// 3. Fitted frequency
// ---------------------------------------------------------------------------

export interface Frequency {
  mean: number;
  variance: number;
  model: 'Poisson' | 'Negative binomial' | 'None';
}

export function fitFrequency(counts: number[]): Frequency {
  const n = counts.length;
  if (n === 0) return { mean: 0, variance: 0, model: 'None' };
  const mean = counts.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? counts.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : mean;
  if (mean <= 0) return { mean: 0, variance: 0, model: 'None' };
  // Hot summers bring several heatwaves at once, which makes counts clump.
  // Where the spread exceeds the mean, a negative binomial captures that
  // clumping and gives a heavier tail than a Poisson would.
  const model = variance > mean * 1.05 ? 'Negative binomial' : 'Poisson';
  return { mean, variance: model === 'Poisson' ? mean : variance, model };
}

/**
 * Probability of paying 0, 1, ... up to the annual limit in a year. Anything
 * above the limit is paid at the limit, so the top bucket collects that tail.
 */
export function paidDistribution(f: Frequency, limit: number): number[] {
  const out = new Array(limit + 1).fill(0);
  if (f.model === 'None' || f.mean <= 0) {
    out[0] = 1;
    return out;
  }

  const pmf: number[] = [];
  if (f.model === 'Poisson') {
    pmf[0] = Math.exp(-f.mean);
    for (let k = 1; k < limit; k++) pmf[k] = (pmf[k - 1] * f.mean) / k;
  } else {
    const r = (f.mean * f.mean) / (f.variance - f.mean);
    const p = r / (r + f.mean);
    pmf[0] = Math.pow(p, r);
    for (let k = 1; k < limit; k++) pmf[k] = (pmf[k - 1] * (k - 1 + r) * (1 - p)) / k;
  }

  let below = 0;
  for (let k = 0; k < limit; k++) {
    out[k] = pmf[k];
    below += pmf[k];
  }
  out[limit] = Math.max(0, 1 - below);
  return out;
}

/**
 * A payout distribution expressed in money rather than event counts. Once heat
 * and cold can pay different amounts per event, counts cannot be added, so
 * everything downstream works on money outcomes instead.
 */
export interface Outcome {
  money: number;
  prob: number;
}

export const outcomesFrom = (dist: number[], payout: number): Outcome[] =>
  dist.map((prob, k) => ({ money: k * payout, prob }));

/** Joint outcomes of two independent perils, every heat count against every cold count. */
export const combineOutcomes = (a: Outcome[], b: Outcome[]): Outcome[] => {
  const out: Outcome[] = [];
  a.forEach(x => b.forEach(y => out.push({ money: x.money + y.money, prob: x.prob * y.prob })));
  return out;
};

const expectedMoney = (o: Outcome[]) => o.reduce((sum, x) => sum + x.money * x.prob, 0);

/** Smallest payout whose cumulative probability reaches the level. */
const percentileMoney = (o: Outcome[], level: number) => {
  const sorted = [...o].sort((x, y) => x.money - y.money);
  let c = 0;
  for (const x of sorted) {
    c += x.prob;
    if (c >= level - 1e-12) return x.money;
  }
  return sorted.length ? sorted[sorted.length - 1].money : 0;
};

// ---------------------------------------------------------------------------
// 4 and 5. Price and capital check
// ---------------------------------------------------------------------------

export const TAIL_LEVEL = 0.995; // the Solvency II and Solvency UK 1-in-200 standard

export interface Price {
  eventsPerYear: number;       // fitted mean, uncapped
  expectedPayout: number;      // per policy per year
  expenses: number;
  expenseRatio: number;        // after any volume discount
  lossRatio: number;           // claims as a share of premium, for benchmarking
  margin: number;
  premium: number;
  tailPayout: number;          // 1-in-200 year payout per policy
  capital: number;             // tail payout minus expected payout
  returnOnCapital: number | null;
  priceable: boolean;
}

// An expense ratio cannot fall to nothing however large the book grows.
const MIN_EXPENSE_RATIO = 0.02;

/**
 * Expense ratio after any volume discount the underwriter has set.
 *
 * Expressed as percentage points removed per doubling of the book above a
 * reference size, which is the shape real scale curves take: each doubling
 * buys roughly the same saving, not each extra policy. Setting the discount
 * to zero, the default, gives a flat expense ratio at every book size.
 *
 * The curve works in both directions. A book smaller than the reference is
 * charged a higher expense ratio by the same rule.
 */
export function effectiveExpenseRatio(a: Assumptions, policies: number): number {
  const book = Math.max(1, policies);
  const reference = Math.max(1, a.referencePolicies);
  const doublings = Math.log2(book / reference);
  const raw = a.expenseRatio - a.volumeDiscountPerDoubling * doublings;

  // Deliberately not capped against the combined ratio. If expenses swallow the
  // whole target, that combination is unviable and priceFrom reports it as
  // unpriceable. Capping instead would quietly invent a workable expense ratio
  // the user never asked for and print a plausible-looking premium from it.
  return Math.max(MIN_EXPENSE_RATIO, raw);
}

/**
 * Premium is solved so the combined ratio lands exactly on the target.
 *
 *   claims + expenses = target combined ratio x premium
 *
 * With expenses a share of premium, the loss ratio is simply what the target
 * leaves after expenses, and the premium follows directly.
 */
export function priceFrom(
  outcomes: Outcome[],
  eventsPerYear: number,
  a: Assumptions,
  policies: number
): Price {
  const expectedPayout = expectedMoney(outcomes);
  const tailPayout = percentileMoney(outcomes, TAIL_LEVEL);

  const expenseRatio = effectiveExpenseRatio(a, policies);
  const lossRatio = a.targetCombinedRatio - expenseRatio;
  const priceable = lossRatio > 0 && expectedPayout > 0;

  const premium = priceable ? expectedPayout / lossRatio : 0;
  const expenses = premium * expenseRatio;
  const margin = premium * (1 - a.targetCombinedRatio);
  const capital = Math.max(0, tailPayout - expectedPayout);

  return {
    eventsPerYear,
    expectedPayout,
    expenses,
    expenseRatio,
    lossRatio,
    margin,
    premium,
    tailPayout,
    capital,
    returnOnCapital: priceable && capital > 0 ? margin / capital : null,
    priceable,
  };
}

// ---------------------------------------------------------------------------
// Assembling a full result for one location
// ---------------------------------------------------------------------------

export interface PerilResult {
  observed: Map<number, number>;
  adjusted: Map<number, number>;
  frequency: Frequency;
  dist: number[];
  outcomes: Outcome[];
  price: Price;
  slopePerDecade: number;
  observedMean: number;
}

const HEAT_MONTHS = [6, 7, 8];
const COLD_MONTHS = [12, 1, 2];

function analysePeril(
  series: DailySeries,
  peril: 'heat' | 'cold',
  a: Assumptions,
  startYear: number,
  endYear: number,
  policies: number
): PerilResult {
  const values = peril === 'heat' ? series.tmax : series.tmean;
  const meets =
    peril === 'heat' ? (v: number) => v >= a.heatThreshold : (v: number) => v <= a.coldThreshold;
  const duration = peril === 'heat' ? a.heatDuration : a.coldDuration;
  const rule = 'perBlock' as const;

  const observed = countEvents(series.dates, values, meets, duration, rule, startYear, endYear);

  const trend = detrend(series.dates, values, peril === 'heat' ? HEAT_MONTHS : COLD_MONTHS);
  const adjusted = countEvents(series.dates, trend.adjusted, meets, duration, rule, startYear, endYear);

  const frequency = fitFrequency(Array.from(adjusted.values()));
  const dist = paidDistribution(frequency, a.annualLimit);
  const payout = peril === 'heat' ? a.heatPayout : a.coldPayout;
  const outcomes = outcomesFrom(dist, payout);

  const obs = Array.from(observed.values());
  return {
    observed,
    adjusted,
    frequency,
    dist,
    outcomes,
    price: priceFrom(outcomes, frequency.mean, a, policies),
    slopePerDecade: trend.slopePerDecade,
    observedMean: obs.reduce((x, y) => x + y, 0) / Math.max(1, obs.length),
  };
}

export interface LocationResult {
  heat: PerilResult;
  cold: PerilResult;
  combined: Price;
}

export function analyse(
  series: DailySeries,
  a: Assumptions,
  startYear: number,
  endYear: number,
  policies: number
): LocationResult {
  const heat = analysePeril(series, 'heat', a, startYear, endYear, policies);
  const cold = analysePeril(series, 'cold', a, startYear, endYear, policies);

  // Heat and cold fall in different seasons, so they are treated as
  // independent. Combining them in one book diversifies the tail.
  const combined = priceFrom(
    combineOutcomes(heat.outcomes, cold.outcomes),
    heat.frequency.mean + cold.frequency.mean,
    a,
    policies
  );

  return { heat, cold, combined };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface ProjectionResult {
  heatScale: number | null;
  coldScale: number | null;
  heatPremium: number | null;
  coldPremium: number | null;
  combinedPremium: number | null;
  /** Year by year premium across the projection window. */
  path: ProjectedYear[];
}

export interface ProjectedYear {
  year: number;
  /** Priced off a trend fitted through the projected rates. The signal. */
  heat: number | null;
  cold: number | null;
  both: number | null;
  /** 95% band on the fitted line, per cover. */
  heatLower: number | null;
  heatUpper: number | null;
  coldLower: number | null;
  coldUpper: number | null;
  bothLower: number | null;
  bothUpper: number | null;
  /** Priced off each year's raw model count. Scatter, not forecast. */
  heatRaw: number | null;
  coldRaw: number | null;
  bothRaw: number | null;
}

function windowRate(counts: Map<number, number>, start: number, end: number): number {
  let s = 0;
  let n = 0;
  counts.forEach((c, y) => {
    if (y >= start && y <= end) {
      s += c;
      n += 1;
    }
  });
  return n > 0 ? s / n : 0;
}

/**
 * Climate models run warm or cold against observed weather, so projected event
 * counts are not used directly. Each model's own baseline is compared with its
 * own future, and that ratio is applied to the observed, trend-adjusted
 * frequency. Model bias largely cancels in the ratio.
 */
function scaleFor(
  models: ModelSeries,
  peril: 'heat' | 'cold',
  a: Assumptions
): number | null {
  const ratios: number[] = [];
  Object.values(models).forEach(series => {
    const values = peril === 'heat' ? series.tmax : series.tmean;
    const meets =
      peril === 'heat' ? (v: number) => v >= a.heatThreshold : (v: number) => v <= a.coldThreshold;
    const duration = peril === 'heat' ? a.heatDuration : a.coldDuration;
    const rule = 'perBlock' as const;
    const counts = countEvents(series.dates, values, meets, duration, rule, BASELINE.start, FUTURE.end);
    const base = windowRate(counts, BASELINE.start, BASELINE.end);
    const fut = windowRate(counts, FUTURE.start, FUTURE.end);
    if (base > 0) ratios.push(fut / base);
  });
  if (ratios.length === 0) return null;
  return ratios.reduce((x, y) => x + y, 0) / ratios.length;
}

/**
 * Yearly rates from each model, as counts rather than ratios.
 *
 * Returned per model so each can be trended against itself. A single year in
 * a climate model is one realisation of what that year could look like, not a
 * forecast of it, so these are only ever used through a fitted line.
 */
function modelYearlyCounts(
  models: ModelSeries,
  peril: 'heat' | 'cold',
  a: Assumptions
): Array<Map<number, number>> {
  return Object.values(models).map(series => {
    const values = peril === 'heat' ? series.tmax : series.tmean;
    const meets =
      peril === 'heat' ? (v: number) => v >= a.heatThreshold : (v: number) => v <= a.coldThreshold;
    const duration = peril === 'heat' ? a.heatDuration : a.coldDuration;
    return countEvents(series.dates, values, meets, duration, 'perBlock', BASELINE.start, FUTURE.end);
  });
}

interface Fit {
  slope: number;
  intercept: number;
  /** Standard error of a fitted value, for the confidence band. */
  seAt: (x: number) => number;
  at: (x: number) => number;
}

/** Least squares fit with the standard error of the fitted line. */
function fitLine(points: Array<[number, number]>): Fit | null {
  const n = points.length;
  if (n < 3) return null;
  const xbar = points.reduce((s, p) => s + p[0], 0) / n;
  const ybar = points.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  points.forEach(([x, y]) => {
    sxy += (x - xbar) * (y - ybar);
    sxx += (x - xbar) ** 2;
  });
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  const intercept = ybar - slope * xbar;

  // Residual spread, then the usual standard error of a fitted mean.
  let sse = 0;
  points.forEach(([x, y]) => {
    const e = y - (intercept + slope * x);
    sse += e * e;
  });
  const s2 = n > 2 ? sse / (n - 2) : 0;

  return {
    slope,
    intercept,
    at: (x: number) => intercept + slope * x,
    seAt: (x: number) => Math.sqrt(Math.max(0, s2 * (1 / n + ((x - xbar) ** 2) / sxx))),
  };
}

export interface ScalePath {
  /** Fitted scale relative to the reference year, per projected year. */
  smooth: Map<number, number>;
  /** Upper and lower bounds of the fitted line, same basis. */
  upper: Map<number, number>;
  lower: Map<number, number>;
  /** Each year's raw model average, relative to the same reference year. */
  raw: Map<number, number>;
}

/**
 * Scale factors relative to a chosen reference year.
 *
 * The observed frequency this multiplies has already been adjusted to the last
 * year of the historical record, so the model change must be measured from that
 * same year. Measuring it from a 2000 to 2019 average instead would count the
 * warming between that window's midpoint and the reference year twice, which
 * overstated the whole projection.
 */
function scalePath(
  models: ModelSeries,
  peril: 'heat' | 'cold',
  a: Assumptions,
  referenceYear: number
): ScalePath | null {
  const perModel = modelYearlyCounts(models, peril, a);

  // Average the models year by year, then trend that.
  const years: number[] = [];
  for (let y = BASELINE.start; y <= FUTURE.end; y++) years.push(y);

  const points: Array<[number, number]> = [];
  const rawCounts = new Map<number, number>();
  years.forEach(y => {
    const vals = perModel.map(m => m.get(y)).filter((v): v is number => v !== undefined);
    if (vals.length === 0) return;
    const mean = vals.reduce((x, z) => x + z, 0) / vals.length;
    rawCounts.set(y, mean);
    points.push([y, mean]);
  });

  const fit = fitLine(points);
  if (!fit) return null;

  const atRef = fit.at(referenceYear);
  if (atRef <= 0) return null;

  const smooth = new Map<number, number>();
  const upper = new Map<number, number>();
  const lower = new Map<number, number>();
  const raw = new Map<number, number>();

  // 95% band, two standard errors either side of the fitted line.
  const Z = 1.96;
  for (let y = FUTURE.start; y <= FUTURE.end; y++) {
    const centre = fit.at(y);
    const se = fit.seAt(y);
    smooth.set(y, Math.max(0, centre / atRef));
    upper.set(y, Math.max(0, (centre + Z * se) / atRef));
    lower.set(y, Math.max(0, (centre - Z * se) / atRef));
    const r = rawCounts.get(y);
    if (r !== undefined) raw.set(y, Math.max(0, r / atRef));
  }

  return { smooth, upper, lower, raw };
}

/** Premium for one peril at a given scale factor on its observed frequency. */
function premiumAtScale(
  peril: PerilResult,
  scale: number,
  a: Assumptions,
  policies: number,
  payout: number
): { premium: number | null; outcomes: Outcome[] } {
  const f = peril.frequency;
  // No history to scale, so the peril contributes nothing rather than falling
  // back to today's frequency, which would overstate the combined figure.
  if (f.model === 'None' || f.mean <= 0) {
    return { premium: null, outcomes: outcomesFrom(paidDistribution(f, a.annualLimit), payout) };
  }
  const dispersion = f.variance / f.mean;
  const mean = Math.max(0, f.mean * scale);
  const scaled: Frequency = {
    mean,
    variance: mean * dispersion,
    model: dispersion > 1.05 ? 'Negative binomial' : 'Poisson',
  };
  const outcomes = outcomesFrom(paidDistribution(scaled, a.annualLimit), payout);
  const priced = priceFrom(outcomes, mean, a, policies);
  return { premium: priced.priceable ? priced.premium : null, outcomes };
}

function scaledPrice(
  peril: PerilResult,
  scale: number,
  a: Assumptions,
  policies: number,
  payout: number
): { price: Price; outcomes: Outcome[] } {
  const f = peril.frequency;
  if (f.model === 'None') return { price: peril.price, outcomes: peril.outcomes };
  const dispersion = f.variance / f.mean;
  const mean = f.mean * scale;
  const scaled: Frequency = {
    mean,
    variance: mean * dispersion,
    model: dispersion > 1.05 ? 'Negative binomial' : 'Poisson',
  };
  const dist = paidDistribution(scaled, a.annualLimit);
  const outcomes = outcomesFrom(dist, payout);
  return { price: priceFrom(outcomes, mean, a, policies), outcomes };
}

export function project(
  base: LocationResult,
  models: ModelSeries,
  a: Assumptions,
  policies: number,
  referenceYear: number
): ProjectionResult {
  const heatPath = scalePath(models, 'heat', a, referenceYear);
  const coldPath = scalePath(models, 'cold', a, referenceYear);

  const priceAt = (peril: PerilResult, scale: number | undefined, payout: number) =>
    scale === undefined ? null : premiumAtScale(peril, scale, a, policies, payout);

  const join = (
    x: { premium: number | null; outcomes: Outcome[] } | null,
    z: { premium: number | null; outcomes: Outcome[] } | null
  ): number | null => {
    if (!x && !z) return null;
    const priced = priceFrom(
      combineOutcomes(x ? x.outcomes : [{ money: 0, prob: 1 }], z ? z.outcomes : [{ money: 0, prob: 1 }]),
      0,
      a,
      policies
    );
    return priced.priceable ? priced.premium : null;
  };

  const forPeril = (
    h: { premium: number | null; outcomes: Outcome[] } | null,
    c: { premium: number | null; outcomes: Outcome[] } | null
  ) => ({ heat: h?.premium ?? null, cold: c?.premium ?? null, both: join(h, c) });

  const path: ProjectedYear[] = [];
  for (let y = FUTURE.start; y <= FUTURE.end; y++) {
    const mid = forPeril(
      priceAt(base.heat, heatPath?.smooth.get(y), a.heatPayout),
      priceAt(base.cold, coldPath?.smooth.get(y), a.coldPayout)
    );
    const low = forPeril(
      priceAt(base.heat, heatPath?.lower.get(y), a.heatPayout),
      priceAt(base.cold, coldPath?.lower.get(y), a.coldPayout)
    );
    const high = forPeril(
      priceAt(base.heat, heatPath?.upper.get(y), a.heatPayout),
      priceAt(base.cold, coldPath?.upper.get(y), a.coldPayout)
    );
    const raw = forPeril(
      priceAt(base.heat, heatPath?.raw.get(y), a.heatPayout),
      priceAt(base.cold, coldPath?.raw.get(y), a.coldPayout)
    );

    path.push({
      year: y,
      heat: mid.heat,
      cold: mid.cold,
      both: mid.both,
      heatLower: low.heat,
      heatUpper: high.heat,
      coldLower: low.cold,
      coldUpper: high.cold,
      bothLower: low.both,
      bothUpper: high.both,
      heatRaw: raw.heat,
      coldRaw: raw.cold,
      bothRaw: raw.both,
    });
  }

  // Scale factors over the whole window, kept for the summary table.
  const windowScale = (p: ScalePath | null) => {
    if (!p) return null;
    const vals = Array.from(p.smooth.values());
    return vals.length ? vals.reduce((x, z) => x + z, 0) / vals.length : null;
  };

  const endYear = FUTURE.end;
  const endHeat = priceAt(base.heat, heatPath?.smooth.get(endYear), a.heatPayout);
  const endCold = priceAt(base.cold, coldPath?.smooth.get(endYear), a.coldPayout);

  return {
    heatScale: windowScale(heatPath),
    coldScale: windowScale(coldPath),
    heatPremium: endHeat?.premium ?? null,
    coldPremium: endCold?.premium ?? null,
    combinedPremium: join(endHeat, endCold),
    path,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const pct = (v: number | null, dp = 0): string =>
  v === null || !isFinite(v) ? '-' : `${(v * 100).toFixed(dp)}%`;
