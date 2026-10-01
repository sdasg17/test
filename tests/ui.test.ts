/**
 * Presentation checks.
 *
 * These cover the things that are easy to get wrong in the interface and
 * impossible to see from the model tests: which years get an axis label,
 * whether the confidence band renders as a range rather than a dash, and
 * whether a slider reaches every value its typed box accepts.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  yearTicks,
  OutlookTooltip,
  ProductSection,
  MAX_HEAT_C,
  MIN_COLD_C,
  clampHeat,
  clampCold,
  ResultStrip,
} from '../src/app/components/Sections';
import { DEFAULTS, analyse } from '../src/app/services/RiskModel';
import { CURRENCIES } from '../src/app/services/Currency';

let passed = 0;
let failed = 0;

function check(name: string, fn: () => string | null) {
  let note: string | null = null;
  try {
    note = fn();
  } catch (e) {
    note = `threw ${(e as Error).message}`;
  }
  if (note === null) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}  ${note}`);
  }
}

const eq = (a: unknown, b: unknown, what: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? null : `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`;

const GBP = CURRENCIES[0];

// ---------------------------------------------------------------------------
// Axis ticks
// ---------------------------------------------------------------------------

check('Hazard window 1991-2025 keeps the final year', () => {
  const t = yearTicks(1991, 2025, 5);
  if (t[t.length - 1] !== 2025) return `last tick is ${t[t.length - 1]}`;
  if (t[0] !== 1991) return `first tick is ${t[0]}`;
  return null;
});

check('Hazard ticks are evenly spaced apart from the end', () => {
  const t = yearTicks(1991, 2025, 5);
  return eq(t, [1991, 1996, 2001, 2006, 2011, 2016, 2021, 2025], 'ticks');
});

check('Outlook window 2031-2050 keeps 2050', () => {
  const t = yearTicks(2031, 2050, 5);
  return eq(t, [2031, 2036, 2041, 2046, 2050], 'ticks');
});

check('A final year that lands on the step is not duplicated', () => {
  const t = yearTicks(2030, 2050, 5);
  return eq(t, [2030, 2035, 2040, 2045, 2050], 'ticks');
});

check('A final year one off the step replaces the tick before it', () => {
  // 2031..2047: forward ticks end at 2046, one year short, so 2046 is dropped
  // rather than printed on top of 2047.
  const t = yearTicks(2031, 2047, 5);
  return eq(t, [2031, 2036, 2041, 2047], 'ticks');
});

check('Every tick sits inside the window', () => {
  for (let start = 1990; start <= 2000; start++) {
    for (let end = start; end <= start + 60; end++) {
      const t = yearTicks(start, end, 5);
      if (t.some(y => y < start || y > end)) return `window ${start}-${end} produced ${t}`;
      if (t.length && t[t.length - 1] !== end) return `window ${start}-${end} lost its end year`;
      const dupes = new Set(t).size !== t.length;
      if (dupes) return `window ${start}-${end} produced duplicates ${t}`;
      for (let i = 1; i < t.length; i++) {
        if (t[i] <= t[i - 1]) return `window ${start}-${end} is not ascending: ${t}`;
      }
    }
  }
  return null;
});

check('A single-year window yields that one year', () => eq(yearTicks(2025, 2025, 5), [2025], 'ticks'));

check('A reversed or non-finite window yields nothing', () => {
  if (yearTicks(2030, 2020, 5).length) return 'reversed window produced ticks';
  if (yearTicks(NaN, 2020, 5).length) return 'NaN start produced ticks';
  return null;
});

// ---------------------------------------------------------------------------
// Outlook tooltip
// ---------------------------------------------------------------------------

const render = (row: unknown, active = true) =>
  renderToStaticMarkup(
    React.createElement(OutlookTooltip, {
      active,
      label: 2050,
      payload: [{ payload: row as never }],
      currency: GBP,
    })
  );

check('Tooltip prints the band as a range, not a dash', () => {
  const html = render({ year: 2050, smoothed: 220, raw: 240, band: [180, 265] });
  if (!html.includes('£180') || !html.includes('£265')) return `band missing from ${html}`;
  if (html.includes('>-<')) return 'tooltip still renders a bare dash';
  return null;
});

check('Tooltip never emits the non-finite dash money() falls back to', () => {
  const html = render({ year: 2050, smoothed: 220, raw: 240, band: [180, 265] });
  // money() returns '-' for NaN; the old formatter coerced the [lo,hi] tuple.
  const dashes = html.split('>-<').length - 1;
  return dashes === 0 ? null : `${dashes} dash cells rendered`;
});

check('Tooltip shows the year, the trend and the model average', () => {
  const html = render({ year: 2050, smoothed: 220, raw: 240, band: [180, 265] });
  for (const want of ['2050', 'Trend', '£220', 'Model average', '£240', '95% range']) {
    if (!html.includes(want)) return `missing ${want}`;
  }
  return null;
});

check('Tooltip omits rows the projection could not price', () => {
  const html = render({ year: 2050, smoothed: undefined, raw: 240, band: undefined });
  if (html.includes('95% range')) return 'band row shown with no band';
  if (html.includes('Trend')) return 'trend row shown with no trend';
  if (!html.includes('£240')) return 'model average dropped';
  return null;
});

check('Tooltip renders nothing when inactive or empty', () => {
  if (render({ year: 2050, smoothed: 220 }, false) !== '') return 'rendered while inactive';
  if (render(undefined) !== '') return 'rendered with no row';
  if (render({ year: 2050 }) !== '') return 'rendered with no series values';
  return null;
});

check('Tooltip respects the chosen currency', () => {
  const inr = CURRENCIES.find(c => c.code === 'INR')!;
  const html = renderToStaticMarkup(
    React.createElement(OutlookTooltip, {
      active: true,
      label: 2050,
      payload: [{ payload: { year: 2050, smoothed: 220, band: [180, 265] } as never }],
      currency: inr,
    })
  );
  return html.includes('₹180') && html.includes('₹265') ? null : `wrong currency in ${html}`;
});

// ---------------------------------------------------------------------------
// Trigger temperature range
//
// The slider and the typed box must cover exactly the same set of values. If
// the box reaches further than the track, dragging silently rewrites a typed
// figure and the extra range is unreachable by mouse.
// ---------------------------------------------------------------------------

check('Heat clamps to the slider track at both ends', () => {
  if (clampHeat(60) !== 60) return `60 became ${clampHeat(60)}`;
  if (clampHeat(75) !== MAX_HEAT_C) return `75 became ${clampHeat(75)}`;
  if (clampHeat(-5) !== 0) return `-5 became ${clampHeat(-5)}`;
  if (clampHeat(28) !== 28) return 'an ordinary value was altered';
  return null;
});

check('Cold clamps to the slider track at both ends', () => {
  if (clampCold(-90) !== -90) return `-90 became ${clampCold(-90)}`;
  if (clampCold(-120) !== MIN_COLD_C) return `-120 became ${clampCold(-120)}`;
  if (clampCold(5) !== 0) return `5 became ${clampCold(5)}`;
  if (clampCold(-6) !== -6) return 'an ordinary value was altered';
  return null;
});

check('A non-finite entry falls back to zero rather than NaN', () => {
  if (!Number.isFinite(clampHeat(NaN))) return 'heat produced a non-finite value';
  if (!Number.isFinite(clampCold(NaN))) return 'cold produced a non-finite value';
  return null;
});

check('Clamping is idempotent, so dragging never walks the value', () => {
  for (let v = -150; v <= 150; v += 0.5) {
    if (clampHeat(clampHeat(v)) !== clampHeat(v)) return `heat moved again at ${v}`;
    if (clampCold(clampCold(v)) !== clampCold(v)) return `cold moved again at ${v}`;
  }
  return null;
});

check('Every value the box accepts survives the slider unchanged', () => {
  // Anything already inside the range must pass through untouched, which is
  // what makes the track and the box interchangeable.
  for (let v = 0; v <= MAX_HEAT_C; v += 0.5) {
    if (clampHeat(v) !== v) return `heat ${v} came back as ${clampHeat(v)}`;
  }
  for (let v = MIN_COLD_C; v <= 0; v += 0.5) {
    if (clampCold(v) !== v) return `cold ${v} came back as ${clampCold(v)}`;
  }
  return null;
});

// ---------------------------------------------------------------------------
// Policy terms sentence
// ---------------------------------------------------------------------------

const product = (peril: 'heat' | 'cold' | 'both') =>
  renderToStaticMarkup(
    React.createElement(ProductSection, {
      a: DEFAULTS,
      onChange: () => {},
      onReset: () => {},
      isDefault: true,
      peril,
      onPerilChange: () => {},
      currency: GBP,
      onCurrencyChange: () => {},
    })
  );

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const inOrder = (text: string, parts: string[]) => {
  let at = 0;
  for (const p of parts) {
    const i = text.indexOf(p, at);
    if (i === -1) return `"${p}" missing or out of order`;
    at = i + p.length;
  }
  return null;
};

check('Heat terms read as one sentence, amount first', () =>
  inOrder(plain(product('heat')), ['Pay £', 'for every', 'consecutive days reaching', '°C or above']));

check('Cold terms read as one sentence, amount first', () =>
  inOrder(plain(product('cold')), ['Pay £', 'for every', 'consecutive days averaging', '°C or below']));

check('Each peril states its own measure', () => {
  const heat = plain(product('heat'));
  const cold = plain(product('cold'));
  // "reaching" is the daily maximum, "averaging" the daily mean. Swapping them
  // would describe a different index from the one the model counts.
  if (heat.includes('averaging')) return 'heat sentence claims an average';
  if (cold.includes('reaching')) return 'cold sentence claims a peak';
  return null;
});

check('Every figure in the sentence keeps an accessible name', () => {
  const html = product('both');
  for (const name of [
    'Heat payout each time',
    'Heat block length in days',
    'Heat trigger temperature, typed',
    'Cold payout each time',
    'Cold block length in days',
    'Cold trigger temperature, typed',
  ]) {
    if (!html.includes(`aria-label="${name}"`)) return `no box named "${name}"`;
  }
  return null;
});

check('The sentence carries the chosen currency symbol', () => {
  const inr = CURRENCIES.find(c => c.code === 'INR')!;
  const html = renderToStaticMarkup(
    React.createElement(ProductSection, {
      a: DEFAULTS,
      onChange: () => {},
      onReset: () => {},
      isDefault: true,
      peril: 'heat',
      onPerilChange: () => {},
      currency: inr,
      onCurrencyChange: () => {},
    })
  );
  return plain(html).includes('Pay ₹') ? null : 'currency symbol not carried into the sentence';
});

check('The note explains what the sentence cannot, that part blocks are lost', () => {
  const text = plain(product('both'));
  if (!text.includes('Only whole blocks pay')) return 'note missing';
  if (!text.includes('do not carry over')) return 'note does not mention the lost remainder';
  return null;
});

check('Trigger limits sit outside the recorded extremes on Earth', () => {
  // 56.7C Furnace Creek 1913 and -89.2C Vostok 1983.
  if (MAX_HEAT_C < 56.7) return `heat cap ${MAX_HEAT_C} excludes the hottest reading on record`;
  if (MIN_COLD_C > -89.2) return `cold cap ${MIN_COLD_C} excludes the coldest reading on record`;
  return null;
});

/**
 * A small synthetic record so the strip can be rendered against a real
 * analysis rather than a hand-built object that could drift from the model.
 */
const synthetic = (hotDays: boolean) => {
  const dates: string[] = [];
  const tmax: number[] = [];
  const tmean: number[] = [];
  for (let y = 2000; y <= 2024; y++) {
    for (let d = 1; d <= 365; d++) {
      const mm = String(Math.min(12, Math.ceil(d / 30.5))).padStart(2, '0');
      const dd = String(((d - 1) % 28) + 1).padStart(2, '0');
      dates.push(`${y}-${mm}-${dd}`);
      // A fortnight of heat every July, nothing otherwise.
      const hot = hotDays && d >= 190 && d < 204;
      tmax.push(hot ? 31 : 14);
      tmean.push(hot ? 24 : 9);
    }
  }
  return { dates, tmax, tmean };
};

const FIXTURE = analyse(synthetic(true), DEFAULTS, 2000, 2024, 10000);
const UNPRICEABLE = analyse(synthetic(false), DEFAULTS, 2000, 2024, 10000);

// ---------------------------------------------------------------------------
// Pinned results strip
//
// The headline figures have to be legible before anything is read and have to
// survive every state the data can be in, because the strip is on screen even
// when the panel that produced a figure is not.
// ---------------------------------------------------------------------------

const strip = (props: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(ResultStrip, props as never));

check('The strip leads with the premium per customer', () => {
  const html = strip({ result: FIXTURE, peril: 'both', currency: GBP, policies: 89000, loading: false });
  const text = plain(html);
  if (!html.includes('rs-headline')) return 'no headline figure';
  // The labels are uppercased in CSS, so the markup carries them as written.
  return inOrder(text.toLowerCase(), ['per customer', 'customers', 'money taken in', 'reserve']);
});

check('The strip counts the book it was given', () => {
  const html = plain(strip({ result: FIXTURE, peril: 'both', currency: GBP, policies: 89000, loading: false }));
  return html.includes('89,000') ? null : `customer count missing from ${html}`;
});

check('The strip says what it is waiting for rather than showing a blank', () => {
  const waiting = plain(strip({ result: null, peril: 'both', currency: GBP, policies: null, loading: true }));
  if (!waiting.includes('Reading the temperature record')) return `loading state reads "${waiting}"`;
  const idle = plain(strip({ result: null, peril: 'both', currency: GBP, policies: null, loading: false }));
  if (!idle.includes('Select an area')) return `idle state reads "${idle}"`;
  return null;
});

check('The strip never prints a figure it does not have', () => {
  // A trigger that never fired gives an unpriceable result, and a headline of
  // zero would read as a free policy rather than as no answer.
  const html = plain(strip({ result: UNPRICEABLE, peril: 'both', currency: GBP, policies: 89000, loading: false }));
  if (html.includes('£0')) return 'printed a zero premium';
  if (!html.includes('never fired')) return `unpriceable state reads "${html}"`;
  return null;
});

check('The strip follows the peril being priced', () => {
  const both = plain(strip({ result: FIXTURE, peril: 'both', currency: GBP, policies: 89000, loading: false }));
  const heat = plain(strip({ result: FIXTURE, peril: 'heat', currency: GBP, policies: 89000, loading: false }));
  if (!both.toLowerCase().includes('heat and cold')) return 'combined cover not named';
  if (!heat.toLowerCase().includes('heat only')) return 'heat-only cover not named';
  return null;
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
