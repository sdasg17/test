import {
  countEvents, detrend, fitFrequency, paidDistribution, outcomesFrom, combineOutcomes,
  priceFrom, effectiveExpenseRatio, analyse, project, DEFAULTS, TAIL_LEVEL, pct,
} from '../src/app/services/RiskModel';
import type { DailySeries, ModelSeries } from '../src/app/services/ClimateData';

let pass = 0, fail = 0; const fails: string[] = [];
const ck = (n: string, c: boolean, d = '') => { if (c) pass++; else { fail++; fails.push(n); } console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

const days = (n: number, start = '2020-07-01') => {
  const d0 = new Date(start + 'T00:00:00Z');
  return Array.from({ length: n }, (_, i) => new Date(d0.getTime() + i * 864e5).toISOString().slice(0, 10));
};

console.log('--- A. Event counting ---');
ck('3-day spell at 3-day trigger pays once',
  countEvents(days(5), [30,30,30,20,20], v=>v>=28, 3, 'perBlock', 2020, 2020).get(2020) === 1);
ck('6-day spell pays twice',
  countEvents(days(8), [30,30,30,30,30,30,20,20], v=>v>=28, 3, 'perBlock', 2020, 2020).get(2020) === 2);
ck('8-day spell pays twice, not 2.67 times',
  countEvents(days(10), [30,30,30,30,30,30,30,30,20,20], v=>v>=28, 3, 'perBlock', 2020, 2020).get(2020) === 2);
ck('2-day spell pays nothing',
  countEvents(days(4), [30,30,20,20], v=>v>=28, 3, 'perBlock', 2020, 2020).get(2020) === 0);
ck('A single sub-threshold day breaks the run',
  countEvents(days(7), [30,30,27.9,30,30,30,20], v=>v>=28, 3, 'perBlock', 2020, 2020).get(2020) === 1);
ck('A null reading breaks the run',
  countEvents(days(7), [30,30,null,30,30,30,20], v=>v>=28, 3, 'perBlock', 2020, 2020).get(2020) === 1);
ck('Exactly at the threshold qualifies (at or above)',
  countEvents(days(4), [28,28,28,20], v=>v>=28, 3, 'perBlock', 2020, 2020).get(2020) === 1);
ck('Cold uses at-or-below correctly',
  countEvents(days(8,'2021-01-01'), [-1,-1,-1,-1,-1,-1,-1,5], v=>v<=0, 7, 'perBlock', 2021, 2021).get(2021) === 1);
ck('A run spanning the year end is credited to the year it completes in',
  countEvents(['2020-12-30','2020-12-31','2021-01-01','2021-01-02'], [30,30,30,20], v=>v>=28, 3, 'perBlock', 2020, 2021).get(2021) === 1);
ck('Years outside the window are ignored without crashing',
  countEvents(days(5,'1980-07-01'), [30,30,30,30,30], v=>v>=28, 3, 'perBlock', 2020, 2020).get(2020) === 0);

console.log('\n--- B. Trend adjustment ---');
{
  const dates: string[] = []; const vals: number[] = [];
  for (let y=1991; y<=2025; y++) for (let m=1; m<=12; m++) for (let d=1; d<=28; d++) {
    dates.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    vals.push((m>=6&&m<=8?24:10) + 0.07*(y-1991));
  }
  const t = detrend(dates, vals, [6,7,8]);
  ck('Recovers a planted +0.70C/decade trend', near(t.slopePerDecade, 0.70, 1e-6), t.slopePerDecade.toFixed(4));
  const i91 = dates.indexOf('1991-07-01'), i25 = dates.indexOf('2025-07-01');
  ck('Oldest year is lifted to the newest year level', near(t.adjusted[i91] as number, vals[i25], 1e-6));
  ck('Newest year is left untouched', near(t.adjusted[i25] as number, vals[i25], 1e-9));
  const flat = detrend(dates, vals.map(()=>20), [6,7,8]);
  ck('A flat record produces a zero trend', near(flat.slopePerDecade, 0, 1e-9));
  const cooling = detrend(dates, vals.map((v,i)=>v - 0.14*(parseInt(dates[i].slice(0,4))-1991)), [6,7,8]);
  ck('A cooling record produces a negative trend', cooling.slopePerDecade < 0, cooling.slopePerDecade.toFixed(3));
  ck('Too little data falls back to no adjustment',
    near(detrend(['2020-07-01','2020-07-02'], [20,21], [6,7,8]).slopePerDecade, 0));
}

console.log('\n--- C. Frequency fitting ---');
ck('Equal counts fit Poisson', fitFrequency([2,2,2,2,2]).model === 'Poisson');
ck('Clustered counts fit negative binomial', fitFrequency([0,0,0,6,0,0,7,0]).model === 'Negative binomial');
ck('All-zero history is unmodellable', fitFrequency([0,0,0,0]).model === 'None');
ck('Empty history is unmodellable', fitFrequency([]).model === 'None');
ck('Poisson variance is forced equal to its mean', near(fitFrequency([1,1,1,1]).variance, fitFrequency([1,1,1,1]).mean));

console.log('\n--- D. Distributions ---');
for (const counts of [[1,1,1],[0,0,3,0,5],[2,2,2,9],[0,1]]) {
  for (const limit of [1,3,8]) {
    const d = paidDistribution(fitFrequency(counts), limit);
    const sum = d.reduce((a,b)=>a+b,0);
    if (!near(sum,1,1e-9) || d.length !== limit+1 || d.some(p=>p<-1e-12||p>1+1e-12)) {
      ck(`Distribution valid for ${JSON.stringify(counts)} limit ${limit}`, false, `sum ${sum}`);
    }
  }
}
ck('All distributions sum to 1, have limit+1 buckets and no invalid probabilities', true);
ck('Zero-frequency puts all mass on zero payouts', paidDistribution(fitFrequency([0,0]), 3)[0] === 1);
{
  const d = paidDistribution({mean: 50, variance: 50, model: 'Poisson'}, 3);
  ck('An extreme frequency saturates the cap rather than breaking', near(d[3], 1, 1e-6) && near(d.reduce((a,b)=>a+b,0), 1, 1e-9));
}

console.log('\n--- E. Money outcomes ---');
{
  const dh = paidDistribution(fitFrequency([1,2,0,1]), 3);
  const dc = paidDistribution(fitFrequency([0,1,0,0]), 3);
  const oh = outcomesFrom(dh, 200), oc = outcomesFrom(dc, 50);
  ck('Outcome probabilities sum to 1', near(oh.reduce((s,x)=>s+x.prob,0), 1));
  ck('Combined outcome probabilities sum to 1', near(combineOutcomes(oh,oc).reduce((s,x)=>s+x.prob,0), 1, 1e-9));
  ck('Combined money is every heat+cold pairing', combineOutcomes(oh,oc).length === oh.length*oc.length);
  ck('Different payouts produce different money ladders',
    oh.map(o=>o.money).join()!==oc.map(o=>o.money).join(), `${oh.map(o=>o.money)} vs ${oc.map(o=>o.money)}`);
}

console.log('\n--- F. Pricing identities ---');
{
  const d = paidDistribution(fitFrequency([1,2,0,1,2]), 3);
  for (const cr of [0.6,0.75,0.85,0.95,1.0]) {
    for (const er of [0.1,0.3,0.5]) {
      if (cr - er <= 0) continue;
      const a = {...DEFAULTS, targetCombinedRatio: cr, expenseRatio: er};
      const p = priceFrom(outcomesFrom(d,100), 1, a, 10000);
      const actual = (p.expectedPayout + p.expenses) / p.premium;
      if (!near(actual, cr, 1e-9)) ck(`Combined ratio holds at CR=${cr} ER=${er}`, false, actual.toFixed(6));
      if (!near(p.margin, p.premium*(1-cr), 1e-9)) ck(`Margin holds at CR=${cr}`, false);
    }
  }
  ck('Combined ratio lands exactly on target across every CR and ER combination', true);
  const base = priceFrom(outcomesFrom(d,100), 1, DEFAULTS, 10000);
  const dbl  = priceFrom(outcomesFrom(d,200), 1, DEFAULTS, 10000);
  ck('Doubling the payout doubles the premium', near(dbl.premium, base.premium*2, 1e-9));
  ck('Doubling the payout leaves return on reserve unchanged', near(dbl.returnOnCapital!, base.returnOnCapital!, 1e-12));
  ck('Doubling the payout leaves both ratios unchanged',
    near(dbl.lossRatio, base.lossRatio) && near(dbl.expenseRatio, base.expenseRatio));
  ck('Reserve is never negative', base.capital >= 0);
  ck('Tail is at least the expected payout', base.tailPayout >= base.expectedPayout - 1e-9);
  ck('Tail never exceeds the contractual maximum', base.tailPayout <= DEFAULTS.annualLimit*100 + 1e-9);
  const zero = priceFrom(outcomesFrom(paidDistribution(fitFrequency([0,0,0]),3),100), 0, DEFAULTS, 10000);
  ck('A peril that never fires is unpriceable, with no NaN', !zero.priceable && zero.premium === 0 && isFinite(zero.capital));
  const bad = priceFrom(outcomesFrom(d,100), 1, {...DEFAULTS, targetCombinedRatio: 0.2, expenseRatio: 0.5}, 10000);
  ck('Expenses above the combined ratio make it unpriceable rather than negative', !bad.priceable && bad.premium === 0);
}

console.log('\n--- G. Volume discount ---');
{
  const off = DEFAULTS;
  ck('Off: identical at 10 and 10 million customers',
    effectiveExpenseRatio(off,10) === effectiveExpenseRatio(off,10_000_000));
  const on = {...DEFAULTS, volumeDiscountPerDoubling: 0.03, referencePolicies: 10000};
  ck('At the reference size the stated ratio applies', near(effectiveExpenseRatio(on,10000), 0.30, 1e-12));
  ck('One doubling removes exactly 3 points', near(effectiveExpenseRatio(on,20000), 0.27, 1e-12));
  ck('One halving adds exactly 3 points', near(effectiveExpenseRatio(on,5000), 0.33, 1e-12));
  ck('Floored, never zero or negative, at absurd scale', effectiveExpenseRatio(on,1e15) >= 0.02);
  ck('Capped so claims always keep a share, at absurdly small scale',
    effectiveExpenseRatio(on,1) < on.targetCombinedRatio);
  ck('Zero customers does not divide by zero', isFinite(effectiveExpenseRatio(on,0)));
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fails.length) console.log('FAILED:', fails.join(' | '));
process.exit(fail?1:0);
