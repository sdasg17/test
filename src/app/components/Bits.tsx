import React from 'react';

export const SectionHead: React.FC<{
  index: string;
  title: string;
  standfirst?: React.ReactNode;
  aside?: React.ReactNode;
}> = ({ index, title, standfirst, aside }) => (
  <header className="flex items-start justify-between gap-4 flex-wrap">
    <div className="min-w-0">
      <p className="section-index">{index}</p>
      <h2 className="section-title">{title}</h2>
      {standfirst && <p className="section-standfirst">{standfirst}</p>}
    </div>
    {aside && <div className="shrink-0">{aside}</div>}
  </header>
);

/**
 * A compact readout. Values are sized to be scanned, not admired.
 *
 * One item per block may be marked `primary`, which prints it at roughly twice
 * the size of the rest. A grid of equally weighted figures gives a reader
 * nothing to land on, and in both of these panels there is a single number the
 * whole panel exists to produce.
 */
export const Readout: React.FC<{
  items: Array<{ label: string; value: string; note?: string; accent?: string; primary?: boolean }>;
}> = ({ items }) => (
  <div className="readout">
    {items.map(i => (
      <div key={i.label} data-primary={i.primary ? '' : undefined}>
        <p className="readout-label" title={i.label}>{i.label}</p>
        <p className="readout-value" style={i.accent ? { color: i.accent } : undefined}>
          {i.value}
        </p>
        {i.note && <p className="readout-note">{i.note}</p>}
      </div>
    ))}
  </div>
);

/** Fields share a two-line label box so their inputs line up in a grid. */
export const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  prefix?: string;
}> = ({ label, value, onChange, step = 1, min, max, suffix, prefix }) => (
  <label className="block">
    <span className="field-label">{label}</span>
    <div className="flex items-center gap-1.5">
      {prefix && <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{prefix}</span>}
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {suffix && <span className="text-xs shrink-0 whitespace-nowrap" style={{ color: 'var(--muted)' }}>{suffix}</span>}
    </div>
  </label>
);

/**
 * A number box that sits inside a line of prose rather than under a label.
 *
 * The terms of the policy read better as one sentence than as three separately
 * labelled boxes, because the sentence can state the rule the boxes only imply.
 * The accessible name carries the wording a label would have given.
 */
export const InlineNumber: React.FC<{
  name: string;
  value: number;
  onChange: (v: number) => void;
  width: number;
  step?: number;
  min?: number;
  max?: number;
}> = ({ name, value, onChange, width, step = 1, min, max }) => (
  <input
    type="number"
    className="inline-number"
    style={{ width }}
    value={Number.isFinite(value) ? value : ''}
    step={step}
    min={min}
    max={max}
    onChange={e => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) onChange(v);
    }}
    aria-label={name}
  />
);

/** The surrounding words in a terms sentence. */
export const Word: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="terms-word">{children}</span>
);

/**
 * One clause of a terms sentence, kept on a single line.
 *
 * The sentence wraps at the width of a peril column, and a figure separated
 * from the words that introduce it reads as a stray number, so each figure
 * travels with its own clause.
 */
export const Term: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="terms-group">{children}</span>
);

/**
 * A slider with its value shown as a readout, which is the control an
 * underwriter reaches for when feeling out a threshold rather than
 * committing to one.
 */
export const SliderField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
}> = ({ label, value, onChange, min, max, step = 1, unit, hint }) => {
  // Sliders are for feeling out a range, typing is for committing to a figure,
  // and both reach exactly the same set of values. The ceiling applies as you
  // type, because a figure above it is already complete. The floor waits for
  // blur, so a field starting at 50 can still be typed as "8" then "85".
  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) onChange(Math.min(max, v));
  };

  const settle = () => {
    const fixed = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
    if (fixed !== value) onChange(fixed);
  };

  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min}
          onChange={e => onChange(parseFloat(e.target.value))}
          aria-label={label}
        />
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          max={max}
          onChange={e => commit(e.target.value)}
          onBlur={settle}
          aria-label={`${label}, typed`}
        />
        {unit && <span style={{ fontSize: 11, color: 'var(--muted)', width: 26 }}>{unit}</span>}
      </div>
      {hint && <p style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
};

export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  peril,
}: {
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
  label?: string;
  peril?: boolean;
}) {
  return (
    <div>
      {label && <span className="field-label">{label}</span>}
      <div className="pill-select">
        {options.map(([key, text]) => (
          <button
            key={key}
            className="pill"
            data-active={value === key}
            data-peril={peril ? key : undefined}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--muted)' }}>
    {children}
  </p>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="panel panel-pad">
    <p className="text-xs" style={{ color: 'var(--muted)' }}>{children}</p>
  </div>
);

export const PanelBlock: React.FC<{ head: string; children: React.ReactNode; aside?: React.ReactNode }> = ({
  head,
  children,
  aside,
}) => (
  <div className="panel">
    <div className="panel-head flex items-center justify-between gap-3">
      <span>{head}</span>
      {aside}
    </div>
    <div className="p-3.5">{children}</div>
  </div>
);
