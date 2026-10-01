import React from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, Scatter, ReferenceLine, Area } from 'recharts';
import { SectionHead, Readout, NumberField, SliderField, Pills, Note, Empty, PanelBlock, InlineNumber, Word, Term } from './Bits';
import { Assumptions, LocationResult, ProjectionResult, Price, effectiveExpenseRatio, pct } from '../services/RiskModel';
import { Currency, CURRENCIES, money, moneyShort, count } from '../services/Currency';
import { POPULATION_YEAR, BASELINE, FUTURE } from '../services/ClimateData';

export type Peril = 'heat' | 'cold' | 'both';

const HEAT = '#ff7a55';
const COLD = '#6fb4f2';

/**
 * Outer limits on a trigger temperature, set just beyond the hottest and
 * coldest air temperatures ever recorded on Earth: 56.7°C at Furnace Creek in
 * 1913 and −89.2°C at Vostok in 1983. No real location on the map is excluded,
 * and a typo cannot stretch the slider track to something absurd.
 */
export const MAX_HEAT_C = 60;
export const MIN_COLD_C = -90;

/**
 * Both controls on a trigger temperature share one range, so the slider can
 * reach every value the box accepts and dragging never silently rewrites a
 * typed figure.
 */
export const clampHeat = (v: number): number =>
  Number.isFinite(v) ? Math.min(MAX_HEAT_C, Math.max(0, v)) : 0;
export const clampCold = (v: number): number =>
  Number.isFinite(v) ? Math.max(MIN_COLD_C, Math.min(0, v)) : 0;

export const perilLabel: Record<Peril, string> = {
  heat: 'Heat only',
  cold: 'Cold only',
  both: 'Heat and cold',
};

export const pickPrice = (r: LocationResult, p: Peril): Price =>
  p === 'heat' ? r.heat.price : p === 'cold' ? r.cold.price : r.combined;

const axis = { fontSize: 10, fill: 'rgba(247,249,250,0.66)' };
const tooltipStyle = {
  fontSize: 12,
  borderRadius: 3,
  background: '#2b323a',
  borderColor: '#566170',
  color: '#f7f9fa',
};

/**
 * Year ticks every `step` years that always include the last year.
 *
 * Recharts' own `interval` counts positions from the left and drops whatever
 * is left over at the right-hand end, which on both of these charts is the
 * single year a reader is most likely to be looking for: the last year of the
 * record on the hazard chart, and 2050 on the outlook chart. This places the
 * ticks explicitly instead, and drops the penultimate one if keeping the end
 * year would print two labels on top of each other.
 */
export const yearTicks = (start: number, end: number, step: number): number[] => {
  if (!isFinite(start) || !isFinite(end) || end < start) return [];
  const out: number[] = [];
  for (let y = start; y <= end; y += step) out.push(y);
  const last = out[out.length - 1];
  if (last !== end) {
    if (end - last < Math.ceil(step / 2)) out.pop();
    out.push(end);
  }
  return out;
};

/**
 * The headline figures, pinned under the section tabs.
 *
 * Without this the first number sits below the fold behind a panel of inputs,
 * and it leaves the screen entirely once you are working in Sensitivity or
 * Outlook. Pinning it means the answer is on screen before anything is read
 * and stays there while the inputs that drive it are being moved.
 */
export const ResultStrip: React.FC<{
  result: LocationResult | null;
  peril: Peril;
  a: Assumptions;
  currency: Currency;
  policies: number | null;
  locationName: string;
  loading: boolean;
}> = ({ result, peril, a, currency, policies, locationName, loading }) => {
  const sel = result ? pickPrice(result, peril) : null;
  const n = policies ?? 0;

  if (!sel || !sel.priceable) {
    return (
      <div className="result-strip" data-empty="">
        <p className="rs-waiting">
          {loading
            ? 'Reading the temperature record'
            : !result
              ? 'Search a city or draw a box on the map to price an area'
              : 'No price: this trigger never fired in the record'}
        </p>
      </div>
    );
  }

  return (
    <div className="result-strip">
      <div className="rs-group rs-group-main">
        <span className="rs-eyebrow">One policy · {perilLabel[peril].toLowerCase()}</span>
        <span className="rs-row">
          <span className="rs-headline">{money(sel.premium, currency)}</span>
          <span className="rs-unit">a year</span>
        </span>
      </div>

      <div className="rs-group">
        <span className="rs-eyebrow">
          The whole book in {locationName} · {pct(a.adoption, a.adoption < 0.01 ? 2 : 1)} take-up
        </span>
        <span className="rs-row">
          {n > 0 ? (
            <>
              <span className="rs-pair">
                <span className="rs-fig">{count(n, currency)}</span>
                <span className="rs-word">customers</span>
              </span>
              <span className="rs-pair">
                <span className="rs-fig">{moneyShort(n * sel.premium, currency)}</span>
                <span className="rs-word">premium</span>
              </span>
              <span className="rs-pair">
                <span className="rs-fig">{moneyShort(n * sel.capital, currency)}</span>
                <span className="rs-word">reserve</span>
              </span>
            </>
          ) : (
            <span className="rs-word">Waiting for a population estimate</span>
          )}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 01 Product
// ---------------------------------------------------------------------------

export const ProductSection: React.FC<{
  a: Assumptions;
  onChange: (a: Assumptions) => void;
  onReset: () => void;
  isDefault: boolean;
  peril: Peril;
  onPerilChange: (p: Peril) => void;
  currency: Currency;
  onCurrencyChange: (code: string) => void;
}> = ({ a, onChange, onReset, isDefault, peril, onPerilChange, currency, onCurrencyChange }) => {
  const set = (patch: Partial<Assumptions>) => onChange({ ...a, ...patch });

  const signed = (v: number) => String(v).replace('-', '−');

  return (
    <>
      <SectionHead
        index="01 / Product"
        title="Set the policy"
        standfirst="The contract itself: how hot or cold it has to get, for how long and how much it pays. The starting values come from official UK definitions. Every figure in the panels below is rebuilt as you change these."
        aside={
          !isDefault && (
            <button onClick={onReset} className="btn-ghost">Reset</button>
          )
        }
      />

      <div className="section-body space-y-3">

        <PanelBlock
          head="Cover"
          aside={<Pills peril value={peril} onChange={onPerilChange} options={[['heat', 'Heat'], ['cold', 'Cold'], ['both', 'Both']]} />}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {peril !== 'heat' && (
              <div className="peril-block" data-peril="cold">
                <p className="peril-head" style={{ color: COLD }}>Cold</p>

                <div className="mb-3.5">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="field-label" style={{ minHeight: 0, marginBottom: 0 }}>
                      Trigger temperature
                    </span>
                    <span className="text-sm font-semibold" style={{ color: COLD }}>
                      {a.coldThreshold}°C
                    </span>
                  </div>
                  <input
                    type="range"
                    className="range-cold"
                    min={MIN_COLD_C}
                    max={0}
                    step={0.5}
                    value={clampCold(a.coldThreshold)}
                    onChange={e => set({ coldThreshold: clampCold(parseFloat(e.target.value)) })}
                    aria-label="Cold trigger temperature"
                  />
                  <div className="flex justify-between mt-1" style={{ fontSize: 9.5, color: 'var(--muted)' }}>
                    <span>{signed(MIN_COLD_C)}°C</span>
                    <span>0°C</span>
                  </div>
                </div>

                <div className="terms-line">
                  <Term>
                    <Word>Pay {currency.symbol}</Word>
                    <InlineNumber
                      name="Cold payout each time"
                      value={a.coldPayout}
                      onChange={v => set({ coldPayout: Math.max(1, v) })}
                      min={1}
                      step={25}
                      width={72}
                    />
                  </Term>
                  <Term>
                    <Word>for every</Word>
                    <InlineNumber
                      name="Cold block length in days"
                      value={a.coldDuration}
                      onChange={v => set({ coldDuration: Math.max(1, Math.min(21, Math.round(v))) })}
                      min={1}
                      max={21}
                      width={48}
                    />
                  </Term>
                  <Word>consecutive days averaging</Word>
                  <Term>
                    <InlineNumber
                      name="Cold trigger temperature, typed"
                      value={a.coldThreshold}
                      onChange={v => set({ coldThreshold: clampCold(v) })}
                      step={0.5}
                      min={MIN_COLD_C}
                      max={0}
                      width={64}
                    />
                    <Word>°C or below</Word>
                  </Term>
                </div>
              </div>
            )}

            {peril !== 'cold' && (
              <div className="peril-block" data-peril="heat">
                <p className="peril-head" style={{ color: HEAT }}>Heat</p>

                <div className="mb-3.5">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="field-label" style={{ minHeight: 0, marginBottom: 0 }}>
                      Trigger temperature
                    </span>
                    <span className="text-sm font-semibold" style={{ color: HEAT }}>
                      {a.heatThreshold}°C
                    </span>
                  </div>
                  <input
                    type="range"
                    className="range-heat"
                    min={0}
                    max={MAX_HEAT_C}
                    step={0.5}
                    value={clampHeat(a.heatThreshold)}
                    onChange={e => set({ heatThreshold: clampHeat(parseFloat(e.target.value)) })}
                    aria-label="Heat trigger temperature"
                  />
                  <div className="flex justify-between mt-1" style={{ fontSize: 9.5, color: 'var(--muted)' }}>
                    <span>0°C</span>
                    <span>{MAX_HEAT_C}°C</span>
                  </div>
                </div>

                <div className="terms-line">
                  <Term>
                    <Word>Pay {currency.symbol}</Word>
                    <InlineNumber
                      name="Heat payout each time"
                      value={a.heatPayout}
                      onChange={v => set({ heatPayout: Math.max(1, v) })}
                      min={1}
                      step={25}
                      width={72}
                    />
                  </Term>
                  <Term>
                    <Word>for every</Word>
                    <InlineNumber
                      name="Heat block length in days"
                      value={a.heatDuration}
                      onChange={v => set({ heatDuration: Math.max(1, Math.min(14, Math.round(v))) })}
                      min={1}
                      max={14}
                      width={48}
                    />
                  </Term>
                  <Word>consecutive days reaching</Word>
                  <Term>
                    <InlineNumber
                      name="Heat trigger temperature, typed"
                      value={a.heatThreshold}
                      onChange={v => set({ heatThreshold: clampHeat(v) })}
                      step={0.5}
                      min={0}
                      max={MAX_HEAT_C}
                      width={64}
                    />
                    <Word>°C or above</Word>
                  </Term>
                </div>
              </div>
            )}
          </div>

          <Note>
            Only whole blocks pay. Five hot days at a three day trigger pay once, and the two spare
            days do not carry over to a later spell. This follows the UK Cold Weather Payment rule,
            which pays again for each further seven day period.
          </Note>
        </PanelBlock>

        <PanelBlock head="Limits">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3 items-start">
            <SliderField
              label="Most payouts in one year"
              value={a.annualLimit}
              onChange={v => set({ annualLimit: Math.round(v) })}
              min={1}
              max={12}
              unit=""
              hint="Caps the worst case for one customer"
            />
            <label className="block">
              <span className="field-label">Currency</span>
              <select value={currency.code} onChange={e => onCurrencyChange(e.target.value)}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
              </select>
            </label>
          </div>
        </PanelBlock>

      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 02 Hazard
// ---------------------------------------------------------------------------

export const RiskSection: React.FC<{
  result: LocationResult | null;
  loading: boolean;
  error: string | null;
  peril: Peril;
  startYear: number;
  endYear: number;
}> = ({ result, loading, error, peril, startYear, endYear }) => {
  const showHeat = peril !== 'cold';
  const showCold = peril !== 'heat';

  const data = result
    ? Array.from(result.heat.observed.keys()).map(y => ({
        year: y,
        Heat: result.heat.observed.get(y) ?? 0,
        Cold: result.cold.observed.get(y) ?? 0,
      }))
    : [];

  const worst = data.reduce(
    (best, d) => {
      const v = (showHeat ? d.Heat : 0) + (showCold ? d.Cold : 0);
      return v > best.v ? { y: d.year, v } : best;
    },
    { y: 0, v: -1 }
  );

  // Ticks are read off the data itself so they always match a bar, even if the
  // record comes back short of the requested window.
  const ticks = data.length
    ? yearTicks(data[0].year, data[data.length - 1].year, 5)
    : yearTicks(startYear, endYear, 5);

  return (
    <>
      <SectionHead
        index="04 / Hazard"
        title="How often it has happened"
        standfirst="How many times your trigger would have fired at this spot, every year since 1991. The adjusted column restates each past year at today's climate, because the early years were cooler and would otherwise make the risk look smaller than it is. Every price in this tool is built on the adjusted figure."
      />

      <div className="section-body">
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-3.5 animate-spin" />
            Reading {endYear - startYear + 1} years of daily temperature
          </div>
        )}
        {error && !loading && (
          <div className="panel panel-pad"><p className="text-xs" style={{ color: HEAT }}>{error}</p></div>
        )}

        {result && !loading && (
          <div className="space-y-3">
            <PanelBlock head="Frequency and warming trend">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Peril</th>
                    <th>Times a year, as it happened</th>
                    <th>Adjusted, used for pricing</th>
                    <th>Warming per decade</th>
                  </tr>
                </thead>
                <tbody>
                  {showHeat && (
                    <tr>
                      <td className="c-heat" style={{ color: HEAT, fontWeight: 600 }}>Heat</td>
                      <td className="c-heat">{result.heat.observedMean.toFixed(2)}</td>
                      <td className="c-heat" style={{ fontWeight: 600 }}>{result.heat.frequency.mean.toFixed(2)}</td>
                      <td className="c-heat">{result.heat.slopePerDecade >= 0 ? '+' : '−'}{Math.abs(result.heat.slopePerDecade).toFixed(2)}°C</td>
                    </tr>
                  )}
                  {showCold && (
                    <tr>
                      <td className="c-cold" style={{ color: COLD, fontWeight: 600 }}>Cold</td>
                      <td className="c-cold">{result.cold.observedMean.toFixed(2)}</td>
                      <td className="c-cold" style={{ fontWeight: 600 }}>{result.cold.frequency.mean.toFixed(2)}</td>
                      <td className="c-cold">{result.cold.slopePerDecade >= 0 ? '+' : '−'}{Math.abs(result.cold.slopePerDecade).toFixed(2)}°C</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ color: 'var(--muted)' }}>Worst year on record</td>
                    <td>{worst.v > 0 ? worst.y : '—'}</td>
                    <td>{worst.v > 0 ? `${worst.v} event${worst.v === 1 ? '' : 's'}` : '—'}</td>
                    <td>{result.heat.frequency.model}</td>
                  </tr>
                </tbody>
              </table>
            </PanelBlock>

            <PanelBlock head="Times the trigger fired, each year">
              <div className="h-44 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="year" tick={axis} tickLine={false} axisLine={{ stroke: '#333940' }} ticks={ticks} interval={0} />
                    <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={22} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#eef1f2' }} labelStyle={{ color: 'rgba(247,249,250,0.7)' }} cursor={{ fill: 'rgba(247,249,250,0.06)' }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    {showHeat && <Bar dataKey="Heat" fill={HEAT} />}
                    {showCold && <Bar dataKey="Cold" fill={COLD} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelBlock>
          </div>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 02 Price
// ---------------------------------------------------------------------------

export const PriceSection: React.FC<{
  result: LocationResult | null;
  peril: Peril;
  a: Assumptions;
  onChange: (a: Assumptions) => void;
  currency: Currency;
  book: number;
  onGoToHazard: () => void;
}> = ({ result, peril, a, onChange, currency, book, onGoToHazard }) => {
  const set = (patch: Partial<Assumptions>) => onChange({ ...a, ...patch });
  const invalid = a.targetCombinedRatio - a.expenseRatio <= 0;

  if (!result) {
    return (
      <>
        <SectionHead index="02 / Price" title="What to charge" />
        <div className="section-body"><Empty>Waiting for the temperature record.</Empty></div>
      </>
    );
  }

  const showHeat = peril !== 'cold';
  const showCold = peril !== 'heat';
  const showBoth = peril === 'both';
  const sel = pickPrice(result, peril);
  const separateTail = result.heat.price.tailPayout + result.cold.price.tailPayout;

  // Cover that runs both ways can carry two different payouts, so the plain
  // reading has to name both rather than pretend there is one figure.
  const payoutPhrase =
    peril === 'heat'
      ? `${money(a.heatPayout, currency, 0)} every time a heatwave is triggered`
      : peril === 'cold'
        ? `${money(a.coldPayout, currency, 0)} every time a cold spell is triggered`
        : a.heatPayout === a.coldPayout
          ? `${money(a.heatPayout, currency, 0)} every time either trigger is met`
          : `${money(a.heatPayout, currency, 0)} per heatwave and ${money(a.coldPayout, currency, 0)} per cold spell`;

  const rows: Array<{ label: string; pick: (p: Price) => string; strong?: boolean }> = [
    { label: 'Payouts a year, adjusted', pick: p => p.eventsPerYear.toFixed(2) },
    { label: 'Paid out in a normal year', pick: p => money(p.expectedPayout, currency) },
    { label: 'Running costs', pick: p => money(p.expenses, currency) },
    { label: 'Profit', pick: p => money(p.margin, currency) },
    { label: 'Yearly price', pick: p => money(p.premium, currency), strong: true },
    { label: 'Share spent on claims', pick: p => pct(p.lossRatio) },
    { label: 'Share spent on costs', pick: p => pct(p.expenseRatio) },
    { label: 'Payout in a 1-in-200 year', pick: p => money(p.tailPayout, currency, 0) },
    { label: 'Money held in reserve', pick: p => money(p.capital, currency, 0) },
    { label: 'Return on that reserve', pick: p => pct(p.returnOnCapital) },
  ];

  const cell = (p: Price, f: (p: Price) => string) => (p.priceable ? f(p) : '—');

  return (
    <>
      <SectionHead
        index="02 / Price"
        title="What to charge"
        standfirst={`The yearly price per customer. It is set so that ${pct(a.targetCombinedRatio)} of the premium goes on claims and running costs, leaving the rest as profit. The reserve is the spare money an insurer must hold back for a very bad year.`}
      />

      <div className="section-body space-y-3">
        {sel.priceable && (
          <p className="plain-read">
            {money(sel.premium, currency)} a year buys {payoutPhrase}. The price is built on{' '}
            <button type="button" className="jump" onClick={onGoToHazard}>
              {sel.eventsPerYear.toFixed(2)} payouts a year
            </button>{' '}
            adjusted for warming. Of the premium, {money(sel.expectedPayout, currency)} goes on claims,{' '}
            {money(sel.expenses, currency)} on running costs and {money(sel.margin, currency)} is profit.
          </p>
        )}

        <PanelBlock head="How the price is set">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 items-start">
            <SliderField
              label="Combined Ratio (Claims + Opex)"
              value={Math.round(a.targetCombinedRatio * 100)}
              onChange={v => set({ targetCombinedRatio: v / 100 })}
              min={50}
              max={110}
              unit="%"
              hint="The share of the premium that is not profit"
            />
            <SliderField
              label="Opex"
              value={Math.round(a.expenseRatio * 100)}
              onChange={v => set({ expenseRatio: v / 100 })}
              min={5}
              max={60}
              unit="%"
              hint={
                invalid
                  ? 'Opex is too high, nothing left for claims'
                  : `Leaves ${pct(a.targetCombinedRatio - a.expenseRatio)} for claims${
                      a.volumeDiscountPerDoubling > 0 ? `. Volume saving puts it at ${pct(effectiveExpenseRatio(a, book), 1)}` : ''
                    }`
              }
            />
          </div>
          {invalid && (
            <p className="text-xs mt-3" style={{ color: HEAT }}>
              Running costs cannot be bigger than claims and costs combined, or there is nothing left to pay claims with.
            </p>
          )}
        </PanelBlock>

        <div className="panel overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Per customer, per year</th>
                {showHeat && <th className="c-heat" style={{ color: HEAT }}>Heat</th>}
                {showCold && <th className="c-cold" style={{ color: COLD }}>Cold</th>}
                {showBoth && <th>Both</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} data-strong={r.strong}>
                  <td style={{ color: r.strong ? 'var(--ink)' : 'var(--muted)' }}>{r.label}</td>
                  {showHeat && <td className="c-heat">{cell(result.heat.price, r.pick)}</td>}
                  {showCold && <td className="c-cold">{cell(result.cold.price, r.pick)}</td>}
                  {showBoth && <td>{cell(result.combined, r.pick)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sel.lossRatio <= 0 ? (
          <Note>
            Opex is {pct(sel.expenseRatio)} against a combined ratio target of {pct(a.targetCombinedRatio)},
            so there is nothing left to pay claims with and no premium can be solved. Raise the target or
            lower Opex. If a volume saving is switched on, a book this small may simply be unviable.
          </Note>
        ) : (
          ((showHeat && !result.heat.price.priceable) || (showCold && !result.cold.price.priceable)) && (
            <Note>A dash means this trigger never fired in the whole record. That does not mean it is impossible, only that there is nothing here to base a price on.</Note>
          )
        )}
        {showBoth && result.heat.price.priceable && result.cold.price.priceable && (
          <Note>
            Selling heat and cold together costs the same as selling them apart, because the expected
            payouts simply add up.{' '}
            {result.combined.tailPayout < separateTail - 1e-9 ? (
              <>
                What it does change is the worst case. A brutal summer and a brutal winter almost never
                land in the same year, so the 1-in-200 payout drops from {money(separateTail, currency, 0)}{' '}
                to {money(result.combined.tailPayout, currency, 0)}. Same price, less money tied up in
                reserve.
              </>
            ) : (
              <>
                At these settings it does not reduce the worst case either: both perils fire often enough
                that a 1-in-200 year reaches the annual cap on each of them, so the combined worst case
                is still {money(result.combined.tailPayout, currency, 0)}. The diversification benefit
                only appears when a payout at the cap on both perils in the same year is genuinely
                unlikely. Raise the triggers or lower the annual cap to see it.
              </>
            )}
          </Note>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 04 Outlook
// ---------------------------------------------------------------------------

interface OutlookRow {
  year: number;
  smoothed?: number;
  raw?: number;
  band?: [number, number];
}

/**
 * The band series carries a [low, high] pair rather than a single number, so
 * the default tooltip formatter coerces it to NaN and prints a dash. This
 * reads the row directly and renders the band as the range it is.
 */
export const OutlookTooltip: React.FC<{
  active?: boolean;
  label?: number | string;
  payload?: Array<{ payload?: OutlookRow }>;
  currency?: Currency;
}> = ({ active, label, payload, currency }) => {
  if (!active || !currency) return null;
  const row = payload?.[0]?.payload;
  if (!row) return null;

  const lines: Array<{ key: string; value: string; colour: string }> = [];
  if (row.smoothed != null) {
    lines.push({ key: 'Trend', value: money(row.smoothed, currency), colour: HEAT });
  }
  if (row.band) {
    lines.push({
      key: '95% range',
      value: `${money(row.band[0], currency)} – ${money(row.band[1], currency)}`,
      colour: 'rgba(247,249,250,0.85)',
    });
  }
  if (row.raw != null) {
    lines.push({ key: 'Model average', value: money(row.raw, currency), colour: 'rgba(247,249,250,0.6)' });
  }
  if (!lines.length) return null;

  return (
    <div
      style={{
        ...tooltipStyle,
        border: '1px solid #566170',
        padding: '7px 9px',
        minWidth: 160,
      }}
    >
      <div style={{ color: 'rgba(247,249,250,0.7)', marginBottom: 4 }}>{label}</div>
      {lines.map(l => (
        <div
          key={l.key}
          style={{ display: 'flex', justifyContent: 'space-between', gap: 14, lineHeight: 1.55 }}
        >
          <span style={{ color: l.colour }}>{l.key}</span>
          <span style={{ color: '#f7f9fa', fontVariantNumeric: 'tabular-nums' }}>{l.value}</span>
        </div>
      ))}
    </div>
  );
};

export const OutlookSection: React.FC<{
  result: LocationResult | null;
  projection: ProjectionResult | null;
  loading: boolean;
  error: string | null;
  peril: Peril;
  currency: Currency;
  onRun: () => void;
  hasRun: boolean;
}> = ({ result, projection, loading, error, peril, currency, onRun, hasRun }) => {
  const showHeat = peril !== 'cold';
  const showCold = peril !== 'heat';
  const now = result ? pickPrice(result, peril) : null;

  const pick = (y: { heat: number | null; cold: number | null; both: number | null }) =>
    peril === 'heat' ? y.heat : peril === 'cold' ? y.cold : y.both;
  const pickRaw = (y: { heatRaw: number | null; coldRaw: number | null; bothRaw: number | null }) =>
    peril === 'heat' ? y.heatRaw : peril === 'cold' ? y.coldRaw : y.bothRaw;

  const path = projection?.path ?? [];
  const yearRow = (year: number) => path.find(p => p.year === year) ?? null;

  const pathAt = (year: number) => {
    const row = yearRow(year);
    const v = row ? pick(row) : null;
    return v != null ? money(v, currency) : '—';
  };

  const endRow = yearRow(FUTURE.end);
  const endValue = endRow ? pick(endRow) : null;
  const endChange = now && now.premium > 0 && endValue != null ? endValue / now.premium - 1 : null;

  const endOf = (which: 'heat' | 'cold') => {
    const row = endRow;
    if (!row) return '—';
    const v = which === 'heat' ? row.heat : row.cold;
    return v != null ? money(v, currency) : '—';
  };

  const pickBand = (p: typeof path[number]): [number, number] | undefined => {
    const lo = peril === 'heat' ? p.heatLower : peril === 'cold' ? p.coldLower : p.bothLower;
    const hi = peril === 'heat' ? p.heatUpper : peril === 'cold' ? p.coldUpper : p.bothUpper;
    return lo != null && hi != null ? [lo, hi] : undefined;
  };

  const chartData: OutlookRow[] = path.map(p => ({
    year: p.year,
    smoothed: pick(p) ?? undefined,
    raw: pickRaw(p) ?? undefined,
    band: pickBand(p),
  }));

  const ticks = chartData.length
    ? yearTicks(chartData[0].year, chartData[chartData.length - 1].year, 5)
    : yearTicks(FUTURE.start, FUTURE.end, 5);

  // If the band at the far end spans today's price, the rise is not
  // distinguishable from noise and the panel says so rather than implying it is.
  const endBand = endRow ? pickBand(endRow) : undefined;
  const riseIsClear =
    endBand && now?.priceable ? endBand[0] > now.premium : null;

  return (
    <>
      <SectionHead
        index="06 / Outlook"
        title="The price in 2050"
        standfirst={`What the same policy would cost in a warmer world. Climate models run slightly hot or cold against real weather, so each one is compared against its own past rather than against reality, which cancels that bias out. You do not need this to price a policy for next year. You need it to decide whether to launch the product at all.`}
        aside={
          !hasRun && !loading ? (
            <button onClick={onRun} className="btn-solid inline-flex items-center gap-1.5">
              Run projection <ArrowRight className="size-3" />
            </button>
          ) : undefined
        }
      />

      <div className="section-body space-y-3">
        {!hasRun && !loading && !error && (
          <Empty>This pulls fifty years of daily forecasts from two climate models, which is by far the slowest thing on the page. It only runs when you ask.</Empty>
        )}
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-3.5 animate-spin" /> Running projection
          </div>
        )}
        {error && !loading && (
          <div className="panel panel-pad flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{error}</p>
            <button onClick={onRun} className="btn-ghost shrink-0">Retry</button>
          </div>
        )}

        {projection && result && !loading && (
          <>
            <Readout
              items={[
                { label: 'Price today', value: now?.priceable ? money(now.premium, currency) : '—' },
                { label: `Price in ${FUTURE.start}`, value: pathAt(FUTURE.start) },
                { label: 'Price in 2040', value: pathAt(2040) },
                { label: `Price in ${FUTURE.end}`, value: pathAt(FUTURE.end), accent: HEAT },
                {
                  label: `Change by ${FUTURE.end}`,
                  value: endChange != null ? `${endChange >= 0 ? '+' : ''}${(endChange * 100).toFixed(0)}%` : '—',
                  accent: endChange != null && endChange > 0 ? HEAT : COLD,
                },
              ]}
            />

            <div className="panel">
              <div className="panel-head">Yearly price across the projection window</div>
              <div className="p-3.5">
                <div className="h-56 -ml-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <XAxis dataKey="year" tick={axis} tickLine={false} axisLine={{ stroke: '#3c4550' }} ticks={ticks} interval={0} />
                      <YAxis
                        tick={axis}
                        tickLine={false}
                        axisLine={false}
                        width={46}
                        tickFormatter={(v: number) => `${currency.symbol}${Math.round(v)}`}
                      />
                      <Tooltip
                        cursor={{ stroke: 'rgba(247,249,250,0.28)' }}
                        content={<OutlookTooltip currency={currency} />}
                      />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                      {now?.priceable && (
                        <ReferenceLine
                          y={now.premium}
                          stroke="rgba(247,249,250,0.45)"
                          strokeDasharray="4 4"
                          label={{
                            value: 'today',
                            position: 'insideTopLeft',
                            fill: 'rgba(247,249,250,0.6)',
                            fontSize: 10,
                          }}
                        />
                      )}
                      <Area
                        name="95% range for the trend"
                        type="monotone"
                        dataKey="band"
                        stroke="none"
                        fill={HEAT}
                        fillOpacity={0.14}
                        activeDot={false}
                      />
                      <Scatter name="Model average, year by year" dataKey="raw" fill="rgba(247,249,250,0.3)" />
                      <Line
                        name="Trend"
                        type="monotone"
                        dataKey="smoothed"
                        stroke={HEAT}
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <Note>
                  The line is the trend fitted through the projected rates and is the only part worth
                  reading. The shaded band is the 95% range for that line, so a narrow band means the
                  rise is well determined and a wide one means it is not. The scattered points are each
                  year's model average before smoothing. They are plotted to show why smoothing is
                  necessary, since no single year in a climate model is a forecast of that year, and two
                  models averaged at the same year is arithmetic rather than physics. The dashed line is
                  today's price.
                  {riseIsClear === false && (
                    <>
                      {' '}
                      Note that the band still contains today's price at the far end, so on this data
                      the increase is not clearly distinguishable from noise.
                    </>
                  )}
                </Note>
              </div>
            </div>

            <div className="panel overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Peril</th>
                    <th>Change in how often</th>
                    <th>Price today</th>
                    <th>Price in {FUTURE.end}</th>
                  </tr>
                </thead>
                <tbody>
                  {showHeat && (
                    <tr>
                      <td className="c-heat" style={{ color: HEAT, fontWeight: 600 }}>Heat</td>
                      <td className="c-heat">{projection.heatScale != null ? `${projection.heatScale >= 1 ? '+' : ''}${((projection.heatScale - 1) * 100).toFixed(0)}%` : 'n/a'}</td>
                      <td>{result.heat.price.priceable ? money(result.heat.price.premium, currency) : '—'}</td>
                      <td>{endOf('heat')}</td>
                    </tr>
                  )}
                  {showCold && (
                    <tr>
                      <td className="c-cold" style={{ color: COLD, fontWeight: 600 }}>Cold</td>
                      <td className="c-cold">{projection.coldScale != null ? `${projection.coldScale >= 1 ? '+' : ''}${((projection.coldScale - 1) * 100).toFixed(0)}%` : 'n/a'}</td>
                      <td>{result.cold.price.priceable ? money(result.cold.price.premium, currency) : '—'}</td>
                      <td>{endOf('cold')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Note>
              Heat and cold move in opposite directions as the world warms, so selling only heat cover
              leaves you exposed to a cost that keeps climbing, while selling both balances out. These
              projections assume high emissions, so treat them as the worse end of the range. Note that
              an annual policy is repriced each year, so only the near end of this path is contractually
              relevant. The far end matters for deciding whether to write the line at all.
            </Note>
          </>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 03 Portfolio
// ---------------------------------------------------------------------------

export const PortfolioSection: React.FC<{
  result: LocationResult | null;
  peril: Peril;
  a: Assumptions;
  onChange: (a: Assumptions) => void;
  currency: Currency;
  population: number | null;
  policies: number | null;
  book: number;
  loading: boolean;
  error: string | null;
  onManualPopulation: (n: number) => void;
}> = ({ result, peril, a, onChange, currency, population, policies, book, loading, error, onManualPopulation }) => {
  const set = (patch: Partial<Assumptions>) => onChange({ ...a, ...patch });
  const [manual, setManual] = React.useState('');
  const sel = result ? pickPrice(result, peril) : null;
  const n = policies ?? 0;

  return (
    <>
      <SectionHead
        index="03 / Portfolio"
        title="Selling it at scale"
        standfirst="What it looks like if you sell this across a whole city. Because every customer is covered by the same thermometer reading, they all get paid on the same day. That is why the worst-year figure is simply one customer multiplied by all of them."
      />

      <div className="section-body space-y-3">
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-3.5 animate-spin" /> Estimating population
          </div>
        )}

        {!loading && population === null && (
          <div className="panel panel-pad max-w-sm">
            <p className="text-xs mb-2.5" style={{ color: 'var(--muted)' }}>
              {error ? 'Population service unavailable. Enter a figure for this area.' : 'Enter a population for this area.'}
            </p>
            <div className="flex gap-2">
              <input type="number" min={0} placeholder="9000000" value={manual} onChange={e => setManual(e.target.value)} />
              <button
                onClick={() => {
                  const v = parseFloat(manual);
                  if (isFinite(v) && v > 0) onManualPopulation(Math.round(v));
                }}
                className="btn-solid shrink-0"
              >
                Use
              </button>
            </div>
          </div>
        )}

        {!loading && population !== null && sel && (
          <>
            <PanelBlock head="Size of the book">
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 items-start">
                <SliderField
                  label="Adoption percentage"
                  value={+(a.adoption * 100).toFixed(2)}
                  onChange={v => set({ adoption: Math.max(0, v) / 100 })}
                  min={0.05}
                  max={100}
                  step={0.05}
                  unit="%"
                  hint={`${count(policies ?? 0, currency)} customers out of ${count(population, currency)} people`}
                />
                <div>
                  <SliderField
                    label="Opex saving each time customers double"
                    value={+(a.volumeDiscountPerDoubling * 100).toFixed(1)}
                    onChange={v => set({ volumeDiscountPerDoubling: Math.max(0, v) / 100 })}
                    min={0}
                    max={6}
                    step={0.5}
                    unit="pp"
                    hint={
                      a.volumeDiscountPerDoubling > 0
                        ? `Opex now ${pct(effectiveExpenseRatio(a, book), 1)}, down from ${pct(a.expenseRatio)}`
                        : 'Off. Opex stays the same at any size.'
                    }
                  />
                  {a.volumeDiscountPerDoubling > 0 && (
                    <div className="mt-3.5">
                      <NumberField
                        label="Reference book size"
                        value={a.referencePolicies}
                        onChange={v => set({ referencePolicies: Math.max(1, Math.round(v)) })}
                        step={1000}
                        min={1}
                      />
                      <p style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
                        The number of customers at which the Opex set in Price applies. Every doubling
                        from here takes the saving off, every halving adds it back.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </PanelBlock>

            <Readout
              items={[
                { label: 'Money taken in', value: sel.priceable ? moneyShort(n * sel.premium, currency) : '—', note: `${count(n, currency)} customers`, primary: true },
                { label: `People living here, ${POPULATION_YEAR}`, value: count(population, currency), note: `${pct(a.adoption, a.adoption < 0.01 ? 2 : 1)} adoption` },
                { label: 'Paid out in a normal year', value: moneyShort(n * sel.expectedPayout, currency) },
                { label: 'Paid out in a 1-in-200 year', value: moneyShort(n * sel.tailPayout, currency), accent: HEAT },
                { label: 'Money held in reserve', value: moneyShort(n * sel.capital, currency) },
              ]}
            />

            {sel.priceable && (
              <p className="plain-read">
                At {pct(a.adoption, a.adoption < 0.01 ? 2 : 1)} adoption that is {count(n, currency)}{' '}
                customers paying {moneyShort(n * sel.premium, currency)} a year. A normal year costs{' '}
                {moneyShort(n * sel.expectedPayout, currency)} in claims. The worst year in two hundred
                costs {moneyShort(n * sel.tailPayout, currency)}, which is why{' '}
                {moneyShort(n * sel.capital, currency)} has to sit in reserve against it.
              </p>
            )}
            <Note>The weather data covers squares roughly 9 to 25 km across, so one reading stands for the whole area. Spreading risk means selling in cities whose weather does not move together, not selling more in one city.</Note>
          </>
        )}
      </div>
    </>
  );
};
