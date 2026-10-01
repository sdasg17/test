import React, { useEffect, useState } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { TOOL_NAME, TOOL_TAGLINE, CREATOR } from '../branding';
import { Logo } from './Logo';

const STORAGE_KEY = 'bellweather-tour-seen-v1';

interface Step {
  title: string;
  /** A step is either one block of prose, or a lead line, a labelled list and a closing line. */
  body?: string;
  lead?: string;
  items?: Array<[string, string]>;
  tail?: string;
}

const STEPS: Step[] = [
  {
    title: 'What this does',
    body:
      'BellWeather prices insurance that pays a fixed sum when temperature crosses an agreed threshold. Settlement follows a published weather index rather than an assessment of loss, which removes claims handling from the product entirely and reduces pricing to a single question: how often that threshold is crossed. Thirty five years of historical weather data answers it for any location on the map.',
  },
  {
    title: 'How to use it',
    lead: 'Select an area on the map, then work down the panels. The bar under the tabs carries the headline figures wherever you are.',
    items: [
      ['01 Product', 'Set the terms. How hot or cold it has to get, for how long and how much it pays.'],
      ['02 Price', 'The premium to charge, the reserve it ties up and the return that reserve earns.'],
      ['03 Portfolio', 'The same policy sold across a whole city, at the take-up rate you choose.'],
      ['04 Hazard', 'How often those terms would have paid out at that spot, every year since 1991. This is the evidence the price is built on.'],
      ['05 Sensitivity', 'One assumption moved across a range, so you can see what the price is most exposed to.'],
      [
        '06 Outlook',
        'The same policy priced to 2050 under climate models. It answers whether the product still works in a warmer world, not what to charge next year.',
      ],
    ],
    tail: 'Every figure recalculates as you change an input.',
  },
  {
    title: 'Scope and limits',
    body:
      'Default triggers follow the Met Office heatwave definition and the UK Cold Weather Payment rule. The reserve standard follows Solvency UK. All are editable. The index cannot reflect an individual policyholder\u2019s actual loss, and no settlement source is named here, so this is an analytical tool rather than a quotation. Method sets out every source, formula and limitation behind the figures.',
  },
];





export const Tour: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setStep(s => Math.min(s + 1, STEPS.length - 1));
      if (e.key === 'ArrowLeft') setStep(s => Math.max(s - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const first = step === 0;
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{ background: 'rgba(12, 14, 16, 0.82)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${TOOL_NAME} walkthrough`}
    >
      <div
        className="panel w-full max-w-lg relative"
        style={{
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          // The six-panel list makes step two the tallest, so the dialog scrolls
          // rather than clipping on a short window.
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-md"
          style={{ color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}
          aria-label="Close walkthrough"
        >
          <X className="size-4" />
        </button>
        <div className="p-6">
          {first && (
            <div className="mb-5 pb-4" style={{ borderBottom: '1px solid var(--rule)' }}>
              <div className="flex items-center gap-3">
                <Logo size={34} weight={30} />
                <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1 }}>{TOOL_NAME}</h1>
              </div>
              <p className="text-xs mt-2.5" style={{ color: 'var(--muted)' }}>{TOOL_TAGLINE}</p>
            </div>
          )}
          <h2 className="mb-2.5" style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>{current.title}</h2>
          {current.body && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{current.body}</p>
          )}
          {current.lead && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{current.lead}</p>
          )}
          {current.items && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
              {current.items.map(([name, text]) => (
                <li
                  key={name}
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--ink-soft)', marginTop: 4 }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{name}</span> {text}
                </li>
              ))}
            </ul>
          )}
          {current.tail && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)', marginTop: 10 }}>
              {current.tail}
            </p>
          )}

          <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Step ${i + 1}`}
                  style={{
                    width: i === step ? 18 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: i === step ? 'var(--signal)' : 'var(--rule-strong)',
                    border: 0,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn-ghost" style={{ color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}>
                Skip
              </button>
              {!first && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="btn-ghost inline-flex items-center gap-1"
                  
                >
                  <ArrowLeft className="size-3" /> Back
                </button>
              )}
              <button
                onClick={() => (last ? onClose() : setStep(s => s + 1))}
                className="btn-solid inline-flex items-center gap-1.5"
                
              >
                {last ? 'Start' : 'Next'}
                {!last && <ArrowRight className="size-3" />}
              </button>
            </div>
          </div>
          {first && <p className="text-xs mt-4" style={{ color: 'var(--muted)' }}>Built by {CREATOR}</p>}
        </div>
      </div>
    </div>
  );
};

// Shown on every load by design: this is a specialist tool and most visitors
// arrive without context, so the orientation is worth repeating.
export const hasSeenTour = (): boolean => false;

export const markTourSeen = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private browsing: the tour shows again next visit */
  }
};
