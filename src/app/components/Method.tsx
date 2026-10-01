import React from 'react';
import { TOOL_NAME, CREATOR } from '../branding';
import { DEFAULTS } from '../services/RiskModel';
import { HISTORY_START, historyEnd, BASELINE, FUTURE, CLIMATE_MODELS, POPULATION_YEAR } from '../services/ClimateData';

/**
 * Method, grouped to match the analysis panels and written for someone with no
 * insurance background. Every technical term is defined the first time it is
 * used, and nothing has been dropped to make it simpler.
 */

const YEARS = historyEnd() - HISTORY_START + 1;
const pc = (v: number) => `${Math.round(v * 100)}%`;

const Group: React.FC<{ index: string; title: string; children: React.ReactNode }> = ({ index, title, children }) => (
  <section className="pt-7 mt-7" style={{ borderTop: '1px solid var(--rule-strong)' }}>
    <p className="section-index">{index}</p>
    <h3 className="mt-1 mb-4" style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.025em' }}>
      {title}
    </h3>
    {children}
  </section>
);

const Sub: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mt-5">
    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 7 }}>{title}</h4>
    {children}
  </div>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink-soft)' }}>{children}</p>
);

const F: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="text-xs px-3 py-2.5 rounded-sm my-3 leading-relaxed"
    style={{ background: 'var(--void)', border: '1px solid var(--rule)', color: 'var(--ink-soft)' }}
  >
    {children}
  </div>
);

const Table: React.FC<{ head: string[]; rows: string[][] }> = ({ head, rows }) => (
  <div className="panel overflow-x-auto my-3">
    <table className="data-table">
      <thead>
        <tr>{head.map((h, i) => <th key={h} style={i === 0 ? undefined : { textAlign: 'left' }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r[0]}>
            {r.map((c, i) => (
              <td key={i} style={{ textAlign: 'left', color: i === 0 ? 'var(--ink)' : 'var(--ink-soft)' }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const Method: React.FC = () => (
  <div className="h-full overflow-y-auto px-5 py-7 md:px-10 md:py-10">
    <div className="mx-auto pb-24 pt-2" style={{ maxWidth: 860 }}>

      <p className="section-index">Method</p>
      <h2 className="mt-1" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.025em' }}>
        How every number is worked out
      </h2>
      <p className="text-sm mt-4 leading-relaxed" style={{ color: 'var(--muted)' }}>
        Laid out in the same order as the panels, so any figure on screen can be traced back to how it
        was calculated. No insurance background needed. Every web request the tool makes is written to
        the browser console, so the raw data can be checked independently.
      </p>

      {/* ---------------------------------------------------------------- */}
      <Group index="01 / Product" title="What is being sold">
        <P>
          This is insurance that pays a fixed sum whenever the temperature crosses an agreed line. No
          claim form, no inspection, no assessor deciding what your loss was worth. If the thermometer
          crosses the line, the money goes out. The industry calls this parametric cover, because the
          payout depends on a measured parameter rather than on proven damage.
        </P>
        <P>
          That is what makes it possible to price from weather data alone. Ordinary insurance has to
          guess how much damage an event causes, which is hard. Here the payout is written into the
          contract, so the only open question is how often the temperature crosses the line.
        </P>

        <Sub title="When it pays out">
          <P>
            The starting settings are not invented. They copy two official UK definitions, which
            matters because a trigger people already recognise is far easier to explain and to sell.
          </P>
          <Table
            head={['Peril', 'Default setting', 'Where it comes from']}
            rows={[
              ['Heatwave', `Every ${DEFAULTS.heatDuration} days in a row where the day reaches at least ${DEFAULTS.heatThreshold}°C`, 'The Met Office definition of a heatwave. 28°C is the figure used for Greater London'],
              ['Cold wave', `Every ${DEFAULTS.coldDuration} days in a row where the day averages ${DEFAULTS.coldThreshold}°C or below`, 'The trigger for the UK Cold Weather Payment, a government scheme that already works this way'],
            ]}
          />
          <P>
            Both perils pay by duration. Every complete run pays again, so six hot days at a three day
            trigger pay twice, and fourteen cold days at a seven day trigger pay twice. Only complete
            runs count: five hot days pay once and the two spare days are discarded rather than carried
            into a later spell, because any day that fails the trigger resets the count. The Met Office
            would describe six hot days as a single heatwave, but that is a way of describing weather
            rather than a rule for paying money. Someone unable to work for six days has lost roughly
            twice what three days costs them, so paying by duration is the more defensible contract.
            It also matches how the government's Cold Weather Payment already works.
          </P>
        </Sub>

        <Sub title="What each control changes">
          <Table
            head={['Control', 'What it does']}
            rows={[
              ['Amount paid each time, Product', 'The sum in the policy sentence. Set separately for heat and cold, so the two perils can carry different sums. Scales the money figures without changing any of the percentages'],
              ['Most payouts in one year, Product', 'Caps how many times one customer can be paid in a year. This is what limits the insurer\'s worst case'],
              ['Combined Ratio, Price', 'The target the price is solved to hit. Anything under 100% means the insurer makes money on the underwriting'],
              ['Opex, Price', 'How much of each premium is eaten by selling and administering the policy'],
              ['Adoption percentage, Portfolio', 'Turns the local population into a customer count, which drives the city-wide totals and, if the volume saving is on, the price too'],
              ['Opex volume saving, Portfolio', 'How much cheaper Opex gets each time the customer base doubles. Cannot go below zero'],
              ['Reference book size, Portfolio', 'The customer count at which the Opex set in Price is true. The anchor for the volume saving'],
            ]}
          />
        </Sub>
      </Group>

      {/* ---------------------------------------------------------------- */}
      <Group index="02 / Price" title="Turning that into a price">
        <Sub title="The calculation">
          <P>
            Insurers describe pricing with two percentages. The loss ratio is the share of each premium
            expected to go out again as claims. The expense ratio is the share eaten by selling and
            running the policy. Added together they give the combined ratio, and whatever is left below
            100% is profit. So a combined ratio of {pc(DEFAULTS.targetCombinedRatio)} means{' '}
            {pc(1 - DEFAULTS.targetCombinedRatio)} of every premium is profit.
          </P>
          <P>
            Rather than adding up costs and seeing what comes out, this works backwards from a chosen
            combined ratio, which is how a lot of retail insurance is actually priced.
          </P>
          <F>
            claims share + costs share = target
            <br />
            {pc(DEFAULTS.targetCombinedRatio - DEFAULTS.expenseRatio)} + {pc(DEFAULTS.expenseRatio)} = {pc(DEFAULTS.targetCombinedRatio)}
            <br />
            <br />
            yearly price = expected payouts ÷ claims share
            <br />
            running costs = price × costs share
            <br />
            profit = price × whatever is left over
          </F>
          <P>
            Expected payouts means the average number of paying events a year, taken from the fitted
            curve, multiplied by the amount paid per event.
          </P>
        </Sub>

        <Sub title="Is that a fair price?">
          <P>
            The claims share is the number to judge it by, because it tells you how much of a customer's
            money comes back to customers. The FCA publishes exactly this figure for every retail
            insurance product sold in the UK. In its 2024 data it was 54% for car insurance and 46% for
            home. Products the regulator has criticised as poor value sit far lower: 4% for the GAP
            cover sold alongside cars, and around 9% for annual European travel insurance.
          </P>
          <P>
            That matters here because this product is structurally closest to travel and personal
            accident cover, which is exactly where the worst ratios cluster. Setting the claims share
            near car and home insurance is therefore a deliberate choice to be on the right side of
            that comparison.
          </P>
        </Sub>

        <Sub title="Why costs fall as you sell more">
          <P>
            By default running costs are a flat share of the premium, which assumes selling to a
            thousand people costs as much per person as selling to a million. That is not true.
            Commission and per-policy admin do rise with the number of customers, but the platform,
            compliance and actuarial costs are largely fixed and get cheaper per person as you grow.
          </P>
          <P>
            Rather than guess any particular insurer's cost structure, the tool lets you set your own
            curve, expressed as the saving each time the customer base doubles. That is the shape real
            economies of scale take, since each doubling buys roughly the same saving rather than each
            extra customer doing so.
          </P>
          <F>
            costs share = starting share − saving × (number of doublings above the reference size)
          </F>
          <P>
            It works both ways, so a customer base smaller than the reference is charged more. The
            result is capped at both ends, so costs never fall to nothing and claims always keep a
            share.
          </P>
        </Sub>

        <Sub title="Money held in reserve">
          <P>
            Pricing to a fixed combined ratio gives every location the same profit margin, however
            unpredictable its weather is. That is not right on its own, so there is a second check.
          </P>
          <P>
            Insurers must hold spare money aside for a disastrous year, and UK rules set the bar at
            surviving all but the worst year in two hundred. That reserve is real money sitting idle,
            so the profit has to be worth the cost of tying it up.
          </P>
          <F>
            payout in a 1-in-200 year = read off the fitted curve at the 99.5% point
            <br />
            money held in reserve = that payout − payouts in a normal year
            <br />
            return on reserve = profit ÷ money held in reserve
          </F>
          <P>
            A low return on reserve means the profit does not justify the money locked up. That is the
            signal to charge more, cap the payouts lower or decline the risk entirely.
          </P>
        </Sub>

        <Sub title="Selling heat and cold together">
          <P>
            Bundling does not make the price cheaper, because the expected payouts simply add up. What
            it changes is the worst case. A brutal summer and a brutal winter almost never land in the
            same year, so the combined 1-in-200 payout is lower than the two added together. The insurer
            earns the same premium while tying up less money. Bundling is about the reserve, not the
            price.
          </P>
        </Sub>
      </Group>

      {/* ---------------------------------------------------------------- */}
      <Group index="03 / Portfolio" title="Selling it across a city">
        <P>
          The population inside the area you draw comes from WorldPop, a {POPULATION_YEAR} estimate
          mapped onto 100 m squares. If that service does not respond, you can type a figure in
          instead.
        </P>
        <F>
          customers = people living here × share who buy it
          <br />
          money taken in = customers × yearly price
          <br />
          payout in a 1-in-200 year = customers × the 1-in-200 payout for one customer
        </F>
        <P>
          That last line being a plain multiplication is the single most important thing about this
          product. Normally an insurer relies on customers having bad luck at different times, so the
          good years pay for the bad. Here everyone is covered by the same thermometer, so when it pays
          out it pays out to everybody at once. A hundred thousand customers are not a hundred thousand
          separate risks. They are one risk, repeated a hundred thousand times. The only real way to
          spread it is to sell in places whose weather does not move together.
        </P>
      </Group>

      {/* ---------------------------------------------------------------- */}
      <Group index="04 / Hazard" title="How often it actually happens">
        <Sub title="Where the weather comes from">
          <P>
            Daily high and average temperature from the Open-Meteo Historical Weather API, which serves
            European Centre for Medium-Range Weather Forecasts reanalysis. Reanalysis means a
            reconstruction of past weather that blends real measurements with a weather model to fill
            the gaps, giving complete coverage everywhere rather than only where there happened to be a
            thermometer. It covers squares roughly 9 to 25 km across.
          </P>
          <P>
            The record runs {HISTORY_START} to {historyEnd()}. It starts in {HISTORY_START} because
            that matches the thirty year baseline the Met Office currently uses, and stops at the last
            full year because the archive runs a few days behind real time. The temperature is read at
            a single point, the centre of the area you choose.
          </P>
        </Sub>

        <Sub title="Correcting for a warming climate">
          <P>
            Simply averaging {YEARS} years would understate heat risk and overstate cold risk, because
            the early years in the record were cooler than today. Left uncorrected, an old record makes
            the future look safer than it is. Stripping out that warming trend before pricing is
            standard practice for weather contracts.
          </P>
          <F>
            Work out the average summer high, or average winter temperature, for each year.
            <br />
            Draw a straight line of best fit through those yearly averages.
            <br />
            Nudge every day in every year up or down by the gap between that year's point on the line
            and the final year's.
            <br />
            Count the events again on the corrected record.
          </F>
          <P>
            Summer and winter are corrected separately, because they are not warming at the same rate.
            The panel shows both numbers: what actually happened, and what the same weather would look
            like in today's climate. Every price in this tool, on every panel, is built on the second
            one. The as-it-happened column is shown for comparison only and is never used to calculate
            anything.
          </P>
        </Sub>

        <Sub title="Working out the odds of a very bad year">
          <P>
            {YEARS} years of records cannot show you a once-in-two-centuries year, because one probably
            has not happened yet. So the yearly counts are used to fit a standard statistical curve,
            and the rare end of that curve is read off instead.
          </P>
          <P>
            Which curve depends on the pattern. If the year to year variation is about what you would
            expect from random chance, a Poisson distribution is used, which is the textbook model for
            counting rare events. If the variation is noticeably larger, a negative binomial is used
            instead. That second case is common for heat, because the weather that produces one
            heatwave tends to produce several in the same summer, and the negative binomial allows for
            that clustering by making very bad years more likely than pure chance would suggest.
          </P>
        </Sub>
      </Group>

      {/* ---------------------------------------------------------------- */}
      <Group index="05 / Sensitivity" title="Testing one setting at a time">
        <P>
          This changes a single setting across a range while holding everything else still, and shows
          what happens to the price, the claims share, the worst case and the city-wide totals at each
          step. Every row is recalculated from scratch against the full weather record, so nudging a
          temperature by a degree genuinely re-counts every event across {YEARS} years of daily data
          rather than estimating between two points.
        </P>
        <P>
          Changing one thing at a time is what makes the result readable, and also what limits it. Real
          decisions move several settings together and this cannot show how they interact with each
          other. Where a row shows a dash, the trigger never fired at that setting, which marks the
          point where there is no longer anything in the record to base a price on.
        </P>
      </Group>

      {/* ---------------------------------------------------------------- */}
      <Group index="06 / Outlook" title="What it costs in a warmer world">
        <P>
          Daily temperature out to {FUTURE.end} comes from the Open-Meteo Climate API, using{' '}
          {CLIMATE_MODELS.length} climate models from the CMIP6 research programme, scaled down to
          10 km squares.
        </P>
        <P>
          Climate models tend to run slightly warm or slightly cool compared with real measurements, so
          their event counts are not used directly. Instead each model is compared against itself, which
          cancels most of its bias and leaves only the change, and that change is applied to the real
          historical frequency.
        </P>
        <P>
          The year it is measured from matters. The historical frequency has already been restated at
          the climate of the last year in the record, so the model change has to be measured from that
          same year. A straight line is fitted through each model's yearly counts across its whole span,
          read off at that reference year, and every projected year is expressed as a ratio to it.
          Measuring instead from an average of {BASELINE.start} to {BASELINE.end} would count the
          warming between that window's midpoint and the reference year twice, which overstated the
          whole projection.
        </P>
        <P>
          The panel shows a price for every year of the window rather than a single figure for the
          whole period. Individual years within a climate model are not forecasts of those years, so a
          straight line is fitted through the projected rates and the price is calculated along that
          line. The raw model years are plotted behind it as scattered points, which shows the spread
          the smoothing removes and why removing it is necessary. Averaging two models at the same
          calendar year is arithmetic rather than physics, since one model's 2037 has no relationship
          to another's, which is a further reason to read only the line.
        </P>
        <P>
          The shaded band is the 95% range for the fitted line, from the standard error of the fit.
          A narrow band means the rise is well determined by the model output. A band still containing
          today's price at the far end means it is not, and the panel says so explicitly when that
          happens. The band can appear to narrow at the far end even as the underlying uncertainty
          grows, because the annual limit compresses large frequencies into the same capped payout.
        </P>
        <P>
          These particular model runs assume high emissions, so treat the answer as the worse end of the
          range rather than the most likely one. An annual policy is repriced each year, so only the
          near end of this path is contractually relevant. The far end matters for deciding whether to
          write the line at all, and it is what a multi-year price lock would have to be built on. The
          panel runs only when you ask, because pulling fifty years of daily output from two models is
          heavy enough to use up the data provider's per-minute allowance and would otherwise hold up
          everything else.
        </P>
      </Group>

      {/* ---------------------------------------------------------------- */}
      <Group index="Limits" title="What this cannot tell you">
        <ul className="text-sm space-y-2.5" style={{ color: 'var(--ink-soft)' }}>
          <li>
            <strong>The payout may not match the loss.</strong> The trigger is one point on a map. Someone
            can suffer badly on a day it just misses, or get paid on a day they were perfectly fine.
            Insurers call this basis risk. Every product of this kind has it, and it is the main thing a
            buyer needs to understand before purchasing.
          </li>
          <li>
            <strong>No agreed source for settling claims.</strong> A real contract has to name one specific
            weather station or dataset as the binding one, with backups. Reanalysis is right for working
            out a price and wrong for deciding who gets paid.
          </li>
          <li>
            <strong>The weather data is partly modelled.</strong> It mixes real measurements with a weather
            model, which smooths things out. A single thermometer can record sharper extremes than this
            shows.
          </li>
          <li>
            <strong>One reading for the whole area.</strong> A big area has genuine temperature variation
            inside it that a single point cannot capture.
          </li>
          <li>
            <strong>The population figure is from {POPULATION_YEAR}</strong>, the most recent year WorldPop
            publishes, and the share who buy it is an assumption rather than a forecast.
          </li>
          <li>
            <strong>Rare perils rest on very little data.</strong> Where a trigger only fired a handful of
            times, the fitted curve is built on almost nothing and the price is correspondingly uncertain.
            Cold cover in a mild city is the obvious example.
          </li>
          <li>
            <strong>This is not a quote.</strong> Nobody has agreed to insure anything here.
          </li>
        </ul>
      </Group>

      {/* ---------------------------------------------------------------- */}
      <Group index="Sources" title="How solid is each assumption">
        <P>
          Some of these numbers come from official rules and some are judgement calls, so each is
          labelled by what actually stands behind it.
        </P>
        <Table
          head={['Setting', 'How solid', 'Based on']}
          rows={[
            ['Heat trigger', 'Official', 'The Met Office definition of a heatwave, London threshold'],
            ['Cold trigger', 'Official', 'The UK Cold Weather Payment scheme'],
            ['1-in-200 reserve standard', 'Official', 'UK and EU insurance capital rules'],
            ['Claims share benchmark', 'Official', 'FCA published value measures data, 2024'],
            ['Running costs share', 'Reasonable guess', 'In the usual range for UK personal insurance. Not published for this product'],
            ['Volume saving', 'Your call', 'Insurers do not publish their unit costs. Switched off by default'],
            ['Payout, cap, take-up', 'Your call', 'Design choices, not findings'],
          ]}
        />
      </Group>

      {/* ---------------------------------------------------------------- */}
      <Group index="Credits" title="Data and attribution">
        <P>
          Weather and climate data from Open-Meteo, used under its non-commercial terms. Historical data
          generated using Copernicus Climate Change Service information via ECMWF. Climate projections
          from CMIP6 HighResMIP, CC BY 4.0. Population from WorldPop, University of Southampton. Maps
          and place search from OpenStreetMap contributors, ODbL.
        </P>
        <p className="text-xs mt-5 pt-5" style={{ color: 'var(--muted)', borderTop: '1px solid var(--rule)' }}>
          {TOOL_NAME} was designed and built by {CREATOR}. It began as a business school submission on
          urban heat resilience and was extended into a working pricing model.
        </p>
      </Group>

    </div>
  </div>
);
