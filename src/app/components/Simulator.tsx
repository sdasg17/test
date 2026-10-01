import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { SectionHead, NumberField, Empty, PanelBlock } from './Bits';
import { Peril, pickPrice } from './Sections';
import { Assumptions, analyse, pct } from '../services/RiskModel';
import { DailySeries } from '../services/ClimateData';
import { Currency, money, moneyShort, count } from '../services/Currency';

/**
 * Sensitivity analysis
 *
 * One parameter is swept across a range while everything else is held fixed,
 * which is how an underwriter evidences a choice rather than merely asserting
 * it. Every row is a full recalculation from the stored daily record, not an
 * interpolation, so changing a trigger genuinely re-counts events across the
 * whole history.
 */

type Param =
  | 'heatThreshold'
  | 'coldThreshold'
  | 'heatPayout'
  | 'coldPayout'
  | 'heatDuration'
  | 'coldDuration'
  | 'annualLimit'
  | 'targetCombinedRatio'
  | 'expenseRatio'
  | 'adoption'
  | 'volumeDiscountPerDoubling';

interface ParamSpec {
  key: Param;
  label: string;
  unit: string;
  from: number;
  to: number;
  step: number;
  /** Factor between what the user types and what the model stores. */
  scale: number;
  decimals: number;
}

const SPECS: ParamSpec[] = [
  { key: 'heatThreshold', label: 'Heat trigger', unit: '°C', from: 24, to: 36, step: 1, scale: 1, decimals: 1 },
  { key: 'coldThreshold', label: 'Cold trigger', unit: '°C', from: -6, to: 4, step: 1, scale: 1, decimals: 1 },
  { key: 'heatDuration', label: 'Heat days to pay', unit: 'd', from: 1, to: 8, step: 1, scale: 1, decimals: 0 },
  { key: 'coldDuration', label: 'Cold days to pay', unit: 'd', from: 3, to: 14, step: 1, scale: 1, decimals: 0 },
  { key: 'heatPayout', label: 'Heat payout', unit: '', from: 50, to: 500, step: 50, scale: 1, decimals: 0 },
  { key: 'coldPayout', label: 'Cold payout', unit: '', from: 50, to: 500, step: 50, scale: 1, decimals: 0 },
  { key: 'annualLimit', label: 'Payouts a year cap', unit: '', from: 1, to: 8, step: 1, scale: 1, decimals: 0 },
  { key: 'targetCombinedRatio', label: 'Combined ratio target', unit: '%', from: 70, to: 100, step: 5, scale: 0.01, decimals: 0 },
  { key: 'expenseRatio', label: 'Opex', unit: '%', from: 10, to: 50, step: 5, scale: 0.01, decimals: 0 },
  { key: 'adoption', label: 'Adoption percentage', unit: '%', from: 0.25, to: 5, step: 0.25, scale: 0.01, decimals: 2 },
  { key: 'volumeDiscountPerDoubling', label: 'Opex volume saving', unit: 'pp', from: 0, to: 5, step: 0.5, scale: 0.01, decimals: 1 },
];

const MAX_ROWS = 30;

/** Parameters that only make sense for the cover currently selected. */
const availableFor = (peril: Peril) =>
  SPECS.filter(s => {
    if (peril === 'cold' && s.key.startsWith('heat')) return false;
    if (peril === 'heat' && s.key.startsWith('cold')) return false;
    return true;
  });

export const SimulatorSection: React.FC<{
  history: DailySeries | null;
  a: Assumptions;
  peril: Peril;
  currency: Currency;
  population: number | null;
  startYear: number;
  endYear: number;
}> = ({ history, a, peril, currency, population, startYear, endYear }) => {
  const options = availableFor(peril);
  const [paramKey, setParamKey] = useState<Param>(peril === 'cold' ? 'coldThreshold' : 'heatThreshold');

  const choose = React.useCallback((k: Param) => {
    const next = SPECS.find(x => x.key === k)!;
    setParamKey(k);
    setFrom(next.from);
    setTo(next.to);
    setStep(next.step);
  }, []);

  const initial = SPECS.find(s => s.key === paramKey)!;
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [step, setStep] = useState(initial.step);

  // Switching cover can strip out the parameter being swept, which would
  // otherwise leave the panel sweeping something that is no longer on offer.
  React.useEffect(() => {
    if (!options.some(o => o.key === paramKey)) {
      choose(peril === 'cold' ? 'coldThreshold' : 'heatThreshold');
    }
  }, [peril, options, paramKey, choose]);

  const spec = SPECS.find(s => s.key === paramKey)!;

  const rows = useMemo(() => {
    if (!history) return [];
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const stride = Math.abs(step) || 1;
    const values: number[] = [];
    for (let v = lo; v <= hi + 1e-9 && values.length < MAX_ROWS; v += stride) values.push(+v.toFixed(6));

    return values.map(display => {
      const stored = display * spec.scale;
      const variant: Assumptions = { ...a, [spec.key]: stored } as Assumptions;
      const book =
        population !== null
          ? Math.max(1, Math.round(population * variant.adoption))
          : variant.referencePolicies;
      const res = analyse(history, variant, startYear, endYear, book);
      const p = pickPrice(res, peril);
      return { display, price: p, book, current: Math.abs(stored - (a[spec.key] as number)) < 1e-9 };
    });
  }, [history, a, peril, spec, from, to, step, population, startYear, endYear]);

  const fmtParam = (v: number) =>
    `${v.toFixed(spec.decimals)}${spec.unit ? (spec.unit === '%' || spec.unit === 'pp' ? spec.unit : ` ${spec.unit}`) : ''}`;

  const downloadCsv = () => {
    const head = [
      spec.label,
      'Payouts a year, adjusted',
      'Payout in a normal year',
      'Yearly price',
      'Claims share',
      'Payout in a 1-in-200 year',
      'Return on reserve',
      'Customers',
      'Money taken in',
      'Paid out in a normal year',
    ];
    const body = rows.map(r => [
      spec.key === 'heatPayout' || spec.key === 'coldPayout'
        ? `${currency.symbol}${r.display}`
        : fmtParam(r.display),
      r.price.eventsPerYear.toFixed(3),
      r.price.expectedPayout.toFixed(2),
      r.price.premium.toFixed(2),
      (r.price.lossRatio * 100).toFixed(1),
      r.price.tailPayout.toFixed(0),
      r.price.returnOnCapital != null ? (r.price.returnOnCapital * 100).toFixed(1) : '',
      r.book,
      (r.book * r.price.premium).toFixed(0),
      (r.book * r.price.expectedPayout).toFixed(0),
    ]);
    const csv = [head, ...body].map(line => line.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sensitivity-${spec.key}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <SectionHead
        index="05 / Sensitivity"
        title="Test one setting"
        standfirst="Change one setting across a range and watch what happens to the price, while everything else stays fixed. Each row is worked out from scratch against the full weather record, so moving a temperature really does re-count every event."
        aside={
          rows.length > 0 && (
            <button
              onClick={downloadCsv}
              className="btn-ghost px-3 py-2 inline-flex items-center gap-1.5"
              
            >
              <Download className="size-3" />
              CSV
            </button>
          )
        }
      />

      <div className="section-body">
        <div className="panel panel-pad mb-3">
          <p className="field-label">Setting to test</p>
          <div className="sweep-grid mb-4">
            {options.map(s => (
              <button
                key={s.key}
                className="pill"
                data-active={paramKey === s.key}
                onClick={() => choose(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-sm">
            <NumberField label="From" value={from} onChange={setFrom} step={spec.step} />
            <NumberField label="To" value={to} onChange={setTo} step={spec.step} />
            <NumberField label="Step" value={step} onChange={v => setStep(Math.abs(v) || spec.step)} step={spec.step} min={0.01} />
          </div>
        </div>

        {!history ? (
          <Empty>Waiting for the temperature record.</Empty>
        ) : rows.length === 0 ? (
          <Empty>That range produces no rows. Check the from, to and step values.</Empty>
        ) : (
          <div className="panel panel-pad overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{spec.label}</th>
                  <th>Payouts a year, adjusted</th>
                  <th>Payout, normal year</th>
                  <th>Yearly price</th>
                  <th>Claims share</th>
                  <th>1-in-200</th>
                  <th>Return on reserve</th>
                  <th>Customers</th>
                  <th>Money taken in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.display} data-current={r.current}>
                    <td style={{ fontWeight: r.current ? 600 : 400 }}>
                      {spec.key === 'heatPayout' || spec.key === 'coldPayout'
                        ? money(r.display, currency, 0)
                        : fmtParam(r.display)}
                      {r.current && (
                        <span className="chip ml-2">current</span>
                      )}
                    </td>
                    <td>{r.price.eventsPerYear.toFixed(2)}</td>
                    <td>{r.price.priceable ? money(r.price.expectedPayout, currency) : '-'}</td>
                    <td style={{ fontWeight: 600 }}>{r.price.priceable ? money(r.price.premium, currency) : '-'}</td>
                    <td>{r.price.priceable ? pct(r.price.lossRatio) : '-'}</td>
                    <td>{r.price.priceable ? money(r.price.tailPayout, currency, 0) : '-'}</td>
                    <td>{r.price.priceable ? pct(r.price.returnOnCapital) : '-'}</td>
                    <td>{count(r.book, currency)}</td>
                    <td>{r.price.priceable ? moneyShort(r.book * r.price.premium, currency) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
