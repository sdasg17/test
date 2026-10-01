# Validation

122 checks over the pricing model, the full analysis chain, the data layer and
the interface. No test framework: each file is a standalone script that exits
non-zero on failure, so it runs anywhere Node and esbuild are available.

| File | Checks | Covers |
| --- | --- | --- |
| `model.test.ts` | 44 | Event counting rules, trend adjustment, frequency fitting, distributions, money outcomes, pricing identities, volume discount |
| `analysis.test.ts` | 23 | Full analysis, peril bundling, projection path and bands, plus a 400-case fuzz over random assumptions |
| `data.test.ts` | 22 | Request construction, error handling, rate-limit backoff, climate model parsing, WorldPop polygon and task polling, geometry |
| `ui.test.ts` | 33 | Axis ticks always keep the final year, the outlook tooltip renders the confidence band as a range, a slider reaches every value its typed box accepts, the policy terms read as one sentence, and the pinned results strip labels its scales and survives every data state |

Run one with:

```bash
npx esbuild tests/model.test.ts --bundle --platform=node --outfile=/tmp/t.js && node /tmp/t.js
```

`ui.test.ts` renders components, so it needs the JSX flag:

```bash
npx esbuild tests/ui.test.ts --bundle --platform=node --jsx=automatic --outfile=/tmp/t.js && node /tmp/t.js
```

The data tests stub `globalThis.fetch`, so nothing touches the network.
