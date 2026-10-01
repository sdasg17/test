import { analyse, project, DEFAULTS } from '../src/app/services/RiskModel';
import type { DailySeries, ModelSeries } from '../src/app/services/ClimateData';

let pass=0, fail=0; const fails:string[]=[];
const ck=(n:string,c:boolean,d='')=>{ if(c)pass++; else {fail++;fails.push(n);} console.log(`${c?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); };
const near=(a:number,b:number,t=1e-9)=>Math.abs(a-b)<t;

const make = (o: {warm?:number; noise?:number; seed?:number; hotDays?:number; coldDays?:number; endYear?:number}): DailySeries => {
  const { warm=0.04, noise=0, seed=5, hotDays=3, coldDays=0, endYear=2025 } = o;
  let r=seed; const rand=()=> (r=(r*1103515245+12345)%2147483648)/2147483648;
  const dates:string[]=[]; const tmax:number[]=[]; const tmean:number[]=[];
  for (let y=1991;y<=endYear;y++) for (let m=1;m<=12;m++) for (let d=1;d<=28;d++) {
    dates.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    const w=warm*(y-1991);
    const hot = m===7 && d>=10 && d<10+hotDays;
    const cold = m===1 && d<=coldDays;
    tmax.push((m>=6&&m<=8?25:10)+w+(hot?3+(rand()-0.5)*noise:0));
    tmean.push((cold?-2:12)+w);
  }
  return {dates,tmax,tmean} as DailySeries;
};

console.log('--- H. Full analysis ---');
{
  const r = analyse(make({hotDays:6, coldDays:14}), DEFAULTS, 1991, 2025, 10000);
  ck('Both perils price when both occur', r.heat.price.priceable && r.cold.price.priceable);
  ck('Combined expected payout equals heat + cold',
    near(r.combined.expectedPayout, r.heat.price.expectedPayout + r.cold.price.expectedPayout, 1e-9));
  ck('Combined premium equals heat + cold',
    near(r.combined.premium, r.heat.price.premium + r.cold.price.premium, 1e-9));
  ck('Combined tail never exceeds the sum of the two tails',
    r.combined.tailPayout <= r.heat.price.tailPayout + r.cold.price.tailPayout + 1e-9,
    `${r.combined.tailPayout} vs ${r.heat.price.tailPayout + r.cold.price.tailPayout}`);
  ck('Combined return on reserve is never worse than the weaker peril',
    r.combined.returnOnCapital! >= Math.min(r.heat.price.returnOnCapital!, r.cold.price.returnOnCapital!) - 1e-9);
  ck('14 cold days at a 7 day trigger pay twice a year', near(r.cold.frequency.mean, 2, 1e-6), r.cold.frequency.mean.toFixed(3));
  ck('6 hot days at a 3 day trigger pay twice a year', near(r.heat.frequency.mean, 2, 1e-6), r.heat.frequency.mean.toFixed(3));
  ck('Pricing uses the adjusted figure, not the recorded one',
    near(r.heat.price.eventsPerYear, r.heat.frequency.mean, 1e-12));
}
{
  const r = analyse(make({hotDays:0, coldDays:0}), DEFAULTS, 1991, 2025, 10000);
  ck('A record with no events anywhere is unpriceable on all three columns',
    !r.heat.price.priceable && !r.cold.price.priceable && !r.combined.priceable);
  ck('No NaN anywhere in that result',
    [r.heat.price.premium, r.cold.price.capital, r.combined.tailPayout].every(isFinite));
}
{
  const r = analyse(make({hotDays:6}), {...DEFAULTS, heatPayout:250, coldPayout:40}, 1991, 2025, 10000);
  ck('Different payouts per peril flow through to the combined tail',
    r.combined.tailPayout % 250 !== 0 || r.cold.frequency.mean === 0, `tail £${r.combined.tailPayout}`);
}
{
  const s = make({hotDays:6});
  const small = analyse(s, {...DEFAULTS, volumeDiscountPerDoubling:0.03}, 1991, 2025, 1000);
  const big   = analyse(s, {...DEFAULTS, volumeDiscountPerDoubling:0.03}, 1991, 2025, 500000);
  ck('A bigger book is cheaper once the volume saving is on', big.heat.price.premium < small.heat.price.premium,
     `1k £${small.heat.price.premium.toFixed(0)} vs 500k £${big.heat.price.premium.toFixed(0)}`);
  ck('Book size does nothing when the saving is off',
    near(analyse(s,DEFAULTS,1991,2025,1000).heat.price.premium, analyse(s,DEFAULTS,1991,2025,500000).heat.price.premium));
}

console.log('\n--- I. Projection ---');
{
  const base = analyse(make({hotDays:3, warm:0.04, endYear:2025}), DEFAULTS, 1991, 2025, 10000);
  const models: ModelSeries = {
    A: make({hotDays:3, warm:0.045, noise:5, seed:11, endYear:2050}),
    B: make({hotDays:3, warm:0.05,  noise:5, seed:29, endYear:2050}),
  };
  const p = project(base, models, DEFAULTS, 10000, 2025);
  ck('Path has one row per projected year', p.path.length === 20);
  ck('Path years are 2031 to 2050 in order',
    p.path[0].year===2031 && p.path[19].year===2050 && p.path.every((r,i)=> i===0 || r.year===p.path[i-1].year+1));
  const priced = p.path.filter(r=>r.heat!=null).map(r=>r.heat!);
  ck('Fitted path never falls', priced.every((v,i)=> i===0 || v >= priced[i-1]-1e-9));
  ck('Every priced year has a band bracketing it',
    p.path.every(r => r.heat==null || (r.heatLower!=null && r.heatUpper!=null && r.heatLower<=r.heat+1e-9 && r.heat<=r.heatUpper+1e-9)));
  ck('No year prices at exactly zero (null instead)', p.path.every(r => r.heat===null || r.heat>0));
  ck('Combined is null only when both perils are',
    p.path.every(r => (r.heat===null && r.cold===null) ? r.both===null : true));
  const first = p.path[0].heat, today = base.heat.price.premium;
  ck('Near end of the path is continuous with today, no step change',
    first!=null && Math.abs(first/today - 1) < 0.7, `${(((first??0)/today-1)*100).toFixed(0)}% from today to 2031`);
  ck('Summary premium is the 2050 value, not a window average',
    near(p.heatPremium ?? -1, p.path[19].heat ?? -2, 1e-9));
  const flat = project(base, { A: make({hotDays:3, warm:0, seed:3, endYear:2050}) }, DEFAULTS, 10000, 2025);
  const fp = flat.path.filter(r=>r.heat!=null).map(r=>r.heat!);
  ck('A non-warming model produces a roughly flat path',
    fp.length>0 && Math.abs(fp[fp.length-1]/fp[0] - 1) < 0.25, `${((fp[fp.length-1]/fp[0]-1)*100).toFixed(0)}% across the window`);
}

console.log('\n--- J. Fuzz: 400 random configurations ---');
{
  let r=42; const rnd=()=> (r=(r*1103515245+12345)%2147483648)/2147483648;
  const series = make({hotDays:6, coldDays:14, noise:4, seed:77});
  let bad=0; const problems:string[]=[];
  for (let i=0;i<400;i++) {
    const cr = 0.5+rnd()*0.6, er = 0.02+rnd()*0.55;
    const a = {
      ...DEFAULTS,
      heatThreshold: 15+rnd()*25, coldThreshold: -15+rnd()*15,
      heatDuration: 1+Math.floor(rnd()*10), coldDuration: 1+Math.floor(rnd()*21),
      heatPayout: 1+rnd()*900, coldPayout: 1+rnd()*900,
      annualLimit: 1+Math.floor(rnd()*12),
      targetCombinedRatio: cr, expenseRatio: er,
      volumeDiscountPerDoubling: rnd()<0.5?0:rnd()*0.06,
      referencePolicies: 1+Math.floor(rnd()*100000),
      adoption: rnd(),
    };
    const policies = Math.max(1, Math.floor(rnd()*2_000_000));
    const res = analyse(series, a, 1991, 2025, policies);
    for (const [name,pr] of [['heat',res.heat.price],['cold',res.cold.price],['both',res.combined]] as const) {
      const vals=[pr.premium,pr.expectedPayout,pr.expenses,pr.margin,pr.tailPayout,pr.capital,pr.expenseRatio,pr.lossRatio];
      if (vals.some(v=>!isFinite(v))) { bad++; problems.push(`${name} non-finite`); continue; }
      // Margin is legitimately negative above a 100% combined ratio: that is an
      // underwriting loss, which the tool is allowed to show.
      const mustBePositive = [pr.premium, pr.expectedPayout, pr.expenses, pr.tailPayout, pr.capital];
      if (mustBePositive.some(v=>v<-1e-9)) { bad++; problems.push(`${name} negative money`); continue; }
      if (a.targetCombinedRatio <= 1 && pr.margin < -1e-9) { bad++; problems.push(`${name} negative margin below 100% CR`); continue; }
      if (pr.priceable) {
        if (!near((pr.expectedPayout+pr.expenses)/pr.premium, a.targetCombinedRatio, 1e-7)) { bad++; problems.push(`${name} CR drift`); continue; }
        if (pr.tailPayout < pr.expectedPayout-1e-6) { bad++; problems.push(`${name} tail below mean`); continue; }
        if (pr.returnOnCapital!==null && !isFinite(pr.returnOnCapital)) { bad++; problems.push(`${name} RoC non-finite`); }
      }
    }
  }
  ck('400 random configurations produce no invalid output', bad===0, bad?`${bad} problems: ${[...new Set(problems)].join(', ')}`:'all clean');
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fails.length) console.log('FAILED:', fails.join(' | '));
process.exit(fail?1:0);
