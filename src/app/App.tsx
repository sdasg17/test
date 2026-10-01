import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Square, HelpCircle, RotateCcw } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { Toaster } from './components/ui/sonner';
import { AreaMap } from './components/AreaMap';
import { LocationSearch, SearchBounds } from './components/LocationSearch';
import {
  ProductSection,
  RiskSection,
  PriceSection,
  OutlookSection,
  PortfolioSection,
  ResultStrip,
  Peril,
} from './components/Sections';
import { SimulatorSection } from './components/Simulator';
import { Method } from './components/Method';
import { Tour, hasSeenTour, markTourSeen } from './components/Tour';
import { Logo } from './components/Logo';
import { TOOL_NAME, CREATOR } from './branding';
import {
  Bounds,
  DailySeries,
  ModelSeries,
  centreOf,
  fetchHistory,
  fetchProjection,
  fetchPopulation,
  HISTORY_START,
  historyEnd,
} from './services/ClimateData';
import { Assumptions, DEFAULTS, analyse, project } from './services/RiskModel';
import { findCurrency } from './services/Currency';

const LONDON: { name: string; area: Bounds } = {
  name: 'Greater London',
  area: { north: 51.69, south: 51.29, east: 0.33, west: -0.51 },
};

// Results lead, evidence follows. The order presents the answer the way a
// pricing paper does rather than the order the model computes it in, which is
// why Hazard sits after the price it produces.
const SECTIONS = [
  { id: 'product', index: '01', label: 'Product' },
  { id: 'price', index: '02', label: 'Price' },
  { id: 'portfolio', index: '03', label: 'Portfolio' },
  { id: 'hazard', index: '04', label: 'Hazard' },
  { id: 'sensitivity', index: '05', label: 'Sensitivity' },
  { id: 'outlook', index: '06', label: 'Outlook' },
];

const sameAssumptions = (a: Assumptions, b: Assumptions) =>
  (Object.keys(a) as Array<keyof Assumptions>).every(k => Math.abs(a[k] - b[k]) < 1e-9);

export default function App() {
  const [showMethod, setShowMethod] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const [area, setArea] = useState<Bounds>(LONDON.area);
  const [locationName, setLocationName] = useState(LONDON.name);
  const [isCustomArea, setIsCustomArea] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [draw, setDraw] = useState<{ start: () => void; drawing: boolean } | null>(null);

  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULTS);
  const [peril, setPeril] = useState<Peril>('both');
  const [currencyCode, setCurrencyCode] = useState('GBP');
  const currency = findCurrency(currencyCode);

  const [history, setHistory] = useState<DailySeries | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [models, setModels] = useState<ModelSeries | null>(null);
  const [projLoading, setProjLoading] = useState(false);
  const [projError, setProjError] = useState<string | null>(null);

  const [population, setPopulation] = useState<number | null>(null);
  const [popLoading, setPopLoading] = useState(false);
  const [popError, setPopError] = useState<string | null>(null);

  const [active, setActive] = useState('product');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const index = centreOf(area);
  const startYear = HISTORY_START;
  const endYear = historyEnd();

  useEffect(() => {
    if (!hasSeenTour()) setTourOpen(true);
  }, []);

  const loadArea = useCallback(async (b: Bounds) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const c = centreOf(b);

    setHistory(null);
    setModels(null);
    setPopulation(null);
    setHistoryError(null);
    setProjError(null);
    setPopError(null);
    setHistoryLoading(true);
    setPopLoading(true);
    setProjLoading(false);

    try {
      const h = await fetchHistory(c.lat, c.lon, ctrl.signal);
      if (!ctrl.signal.aborted) setHistory(h);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error(e);
        setHistoryError(`Could not load the temperature record. ${e.message ?? ''}`.trim());
      }
    } finally {
      if (!ctrl.signal.aborted) setHistoryLoading(false);
    }

    try {
      const p = await fetchPopulation(b, ctrl.signal);
      if (!ctrl.signal.aborted) setPopulation(p);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error(e);
        setPopError(e.message ?? 'Population unavailable');
      }
    } finally {
      if (!ctrl.signal.aborted) setPopLoading(false);
    }
  }, []);

  // The climate projection spans fifty years across two models, which is heavy
  // enough to exhaust the minutely allowance by itself. It runs on request.
  const runProjection = useCallback(async () => {
    if (models || projLoading) return;
    setProjLoading(true);
    setProjError(null);
    try {
      const c = centreOf(area);
      const m = await fetchProjection(c.lat, c.lon);
      setModels(m);
    } catch (e: any) {
      console.error(e);
      setProjError(e.message ?? 'Projection unavailable');
    } finally {
      setProjLoading(false);
    }
  }, [area, models, projLoading]);

  useEffect(() => {
    loadArea(LONDON.area);
    return () => abortRef.current?.abort();
  }, [loadArea]);

  const policies =
    population !== null ? Math.max(1, Math.round(population * assumptions.adoption)) : null;
  const book = policies ?? assumptions.referencePolicies;

  const result = useMemo(
    () => (history ? analyse(history, assumptions, startYear, endYear, book) : null),
    [history, assumptions, startYear, endYear, book]
  );

  const projection = useMemo(
    () => (result && models ? project(result, models, assumptions, book, endYear) : null),
    [result, models, assumptions, book, endYear]
  );

  // Which panel is in view. Position-based rather than an IntersectionObserver,
  // The pinned header carries the tabs and the results, so its height is not a
  // constant and anything that scrolls to a section has to clear it. Measuring
  // it once and publishing it as a custom property keeps the scroll offset and
  // the active-tab line honest when the strip wraps or changes state.
  const headRef = useRef<HTMLDivElement | null>(null);
  const headHeight = useRef(96);
  useEffect(() => {
    const head = headRef.current;
    const pane = scrollRef.current;
    if (!head || !pane) return;
    const apply = () => {
      const h = head.getBoundingClientRect().height;
      headHeight.current = h;
      pane.style.setProperty('--doc-head-h', `${Math.round(h)}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(head);
    return () => ro.disconnect();
  }, [showMethod]);

  // because the final section is short and can never satisfy a rootMargin band,
  // so its tab would never light up. Reaching the bottom selects the last one.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || showMethod) return;

    const update = () => {
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 8) {
        setActive(SECTIONS[SECTIONS.length - 1].id);
        return;
      }
      const line = root.getBoundingClientRect().top + headHeight.current + 18;
      let current = SECTIONS[0].id;
      SECTIONS.forEach(sec => {
        const el = document.getElementById(sec.id);
        if (el && el.getBoundingClientRect().top <= line) current = sec.id;
      });
      setActive(current);
    };

    update();
    root.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      root.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [showMethod]);

  const goTo = useCallback((id: string) => {
    setShowMethod(false);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const backToTop = useCallback(() => {
    setShowMethod(false);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  }, []);

  const afterAreaChange = (b: Bounds, name: string, custom: boolean) => {
    setArea(b);
    setLocationName(name);
    setIsCustomArea(custom);
    setFitToken(t => t + 1);
    loadArea(b);
    // The map has done its job, so move the journey on to the analysis.
    // The map stays put. Only the reading column returns to the top.
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const handleSearch = (lat: number, lon: number, name: string, b: SearchBounds) =>
    afterAreaChange(b, name.split(',').slice(0, 2).join(','), false);

  const handleDrawn = (b: Bounds) => {
    const c = centreOf(b);
    afterAreaChange(b, `Custom area · ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`, true);
    toast.success('Pricing the new area');
  };

  const clearArea = () => {
    afterAreaChange(LONDON.area, LONDON.name, false);
    toast.success('Area reset to Greater London');
  };

  return (
    <div className="app-shell">
      <Toaster position="top-center" />
      <Tour open={tourOpen} onClose={() => { setTourOpen(false); markTourSeen(); }} />

      <header className="topbar">
        <div className="topbar-row">
          <button onClick={backToTop} className="wordmark">
            <Logo size={22} weight={34} />
            <span className="wordmark-text">{TOOL_NAME}</span>
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <span className="utility truncate hidden lg:inline">{locationName}</span>
            <div className="seg">
              <button data-active={!showMethod} onClick={backToTop}>Analysis</button>
              <button data-active={showMethod} onClick={() => setShowMethod(true)}>Method</button>
            </div>
            <button onClick={() => setTourOpen(true)} aria-label="Open walkthrough" className="icon-btn">
              <HelpCircle className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      {showMethod ? (
        <main className="flex-1 min-h-0">
          <Method />
        </main>
      ) : (
        <div className="workspace">
          {/* Map, always on screen */}
          <div className="map-pane">
            <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <LocationSearch onLocationSelect={handleSearch} />
              </div>
              {draw && (
                <>
                  <button
                    onClick={draw.start}
                    disabled={draw.drawing}
                    className="btn-solid px-3.5 h-9 inline-flex items-center gap-2 shrink-0"
                  >
                    <Square className="size-3.5" />
                    <span className="hidden sm:inline">{draw.drawing ? 'Drawing' : 'Draw area'}</span>
                  </button>
                  {isCustomArea && (
                    <button
                      onClick={clearArea}
                      className="btn-ghost px-3.5 h-9 inline-flex items-center gap-2 shrink-0"
                      style={{ background: 'var(--paper)' }}
                    >
                      <RotateCcw className="size-3.5" />
                      <span className="hidden sm:inline">Clear</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Nothing on the map says what a visitor is meant to do with it,
                so the prompt sits directly under the controls it refers to and
                changes once an area of their own is in play. */}
            <div className="map-prompt">
              {isCustomArea
                ? 'Drag a new box to re-price, or clear it to go back to the search area.'
                : 'Search any city, or draw a box to price an area of your own.'}
            </div>

            <AreaMap
              area={area}
              fitToken={fitToken}
              onAreaDrawn={handleDrawn}
              onReady={() => setMapReady(true)}
              onDrawControl={(start, drawing) => setDraw({ start, drawing })}
            />

            <div
              className="absolute bottom-0 left-0 right-0 z-[600] px-4 py-3 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(20,24,27,0.95) 0%, rgba(20,24,27,0) 100%)',
              }}
            >
              <p style={{ fontSize: 10, color: 'var(--signal)', letterSpacing: '0.11em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>
                Pricing this area
              </p>
              <p className="text-xs font-medium truncate">{locationName}</p>
              <p style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                Index {index.lat.toFixed(3)}, {index.lon.toFixed(3)} · {startYear}–{endYear}
              </p>
            </div>

            {!mapReady && (
              <div className="absolute inset-0 flex items-center justify-center z-[700]" style={{ background: 'var(--void)' }}>
                <div className="size-6 rounded-full animate-spin" style={{ border: '1px solid var(--rule)', borderTopColor: 'var(--signal)' }} />
              </div>
            )}
          </div>

          {/* Analysis, scrolling normally beside it */}
          <div ref={scrollRef} className="content-pane">
            <div className="doc-head" ref={headRef}>
              <nav className="doc-nav" aria-label="Sections">
                {SECTIONS.map(sec => (
                  <button
                    key={sec.id}
                    data-active={active === sec.id}
                    onClick={() => goTo(sec.id)}
                  >
                    {sec.index} {sec.label}
                  </button>
                ))}
              </nav>
              <ResultStrip
                result={result}
                peril={peril}
                a={assumptions}
                currency={currency}
                policies={policies}
                locationName={locationName}
                loading={historyLoading}
              />
            </div>

            <section id="product" className="doc-section">
              <ProductSection
                a={assumptions}
                onChange={setAssumptions}
                onReset={() => setAssumptions(DEFAULTS)}
                isDefault={sameAssumptions(assumptions, DEFAULTS)}
                peril={peril}
                onPerilChange={setPeril}
                currency={currency}
                onCurrencyChange={setCurrencyCode}
              />
            </section>

            <section id="price" className="doc-section">
              <PriceSection
                result={result}
                peril={peril}
                a={assumptions}
                onChange={setAssumptions}
                currency={currency}
                book={book}
                onGoToHazard={() => goTo('hazard')}
              />
            </section>

            <section id="portfolio" className="doc-section">
              <PortfolioSection
                result={result}
                peril={peril}
                a={assumptions}
                onChange={setAssumptions}
                currency={currency}
                population={population}
                policies={policies}
                book={book}
                loading={popLoading}
                error={popError}
                onManualPopulation={n => { setPopulation(n); setPopError(null); }}
              />
            </section>

            <section id="hazard" className="doc-section">
              <RiskSection
                result={result}
                loading={historyLoading}
                error={historyError}
                peril={peril}
                startYear={startYear}
                endYear={endYear}
              />
            </section>

            <section id="sensitivity" className="doc-section">
              <SimulatorSection
                history={history}
                a={assumptions}
                peril={peril}
                currency={currency}
                population={population}
                startYear={startYear}
                endYear={endYear}
              />
            </section>
            <section id="outlook" className="doc-section">
              <OutlookSection
                result={result}
                projection={projection}
                loading={projLoading}
                error={projError}
                peril={peril}
                currency={currency}
                onRun={runProjection}
                hasRun={models !== null}
              />
            </section>
            <footer className="doc-section" style={{ paddingTop: 18, paddingBottom: 22 }}>
              <p className="utility">{TOOL_NAME} · Built by {CREATOR}</p>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
