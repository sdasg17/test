import { fetchHistory, fetchProjection, fetchPopulation, centreOf, historyEnd, HISTORY_START, CLIMATE_MODELS } from '../src/app/services/ClimateData';

let pass=0, fail=0; const fails:string[]=[];
const ck=(n:string,c:boolean,d='')=>{ if(c)pass++; else {fail++;fails.push(n);} console.log(`${c?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); };

const calls: string[] = [];
let script: Array<{status:number; body:any; headers?:Record<string,string>}> = [];
(globalThis as any).fetch = async (url: string) => {
  calls.push(url);
  const next = script.shift() ?? { status: 200, body: {} };
  return {
    ok: next.status >= 200 && next.status < 300,
    status: next.status,
    headers: { get: (k: string) => next.headers?.[k.toLowerCase()] ?? null },
    json: async () => next.body,
  } as any;
};

const run = async () => {
  console.log('--- K. Request construction ---');
  script = [{ status:200, body:{ daily:{ time:['2020-01-01','2020-01-02'], temperature_2m_max:[12,14], temperature_2m_mean:[8,9] } } }];
  calls.length = 0;
  const h = await fetchHistory(51.49, -0.09);
  const u = new URL(calls[0]);
  ck('History hits the archive endpoint', u.host.includes('archive-api.open-meteo.com'));
  ck('History asks for both variables', u.searchParams.get('daily') === 'temperature_2m_max,temperature_2m_mean');
  ck('History starts at the stated first year', u.searchParams.get('start_date') === `${HISTORY_START}-01-01`);
  ck('History ends at the last complete year', u.searchParams.get('end_date') === `${historyEnd()}-12-31`);
  ck('History uses local time so days are bucketed correctly', u.searchParams.get('timezone') === 'auto');
  ck('History parses into aligned arrays', h.dates.length===2 && h.tmax.length===2 && h.tmean.length===2);

  console.log('\n--- L. Error handling ---');
  script = [{ status:400, body:{ error:true, reason:'Bad latitude' } }];
  let msg=''; try { await fetchHistory(999, 999); } catch(e:any){ msg=e.message; }
  ck('A 400 surfaces the provider reason', msg.includes('Bad latitude'), msg);

  script = [{ status:200, body:{ daily:{ time:[] } } }];
  msg=''; try { await fetchHistory(51,0); } catch(e:any){ msg=e.message; }
  ck('An empty archive response is rejected, not silently used', msg.length>0, msg);

  script = [{ status:200, body:{} }];
  msg=''; try { await fetchHistory(51,0); } catch(e:any){ msg=e.message; }
  ck('A malformed response is rejected', msg.length>0, msg);

  console.log('\n--- M. Rate limit backoff ---');
  script = [
    { status:429, body:{}, headers:{'retry-after':'0'} },
    { status:200, body:{ daily:{ time:['2020-01-01'], temperature_2m_max:[12], temperature_2m_mean:[8] } } },
  ];
  calls.length = 0;
  const retried = await fetchHistory(51,0);
  ck('A 429 is retried rather than thrown', retried.dates.length===1 && calls.length===2, `${calls.length} attempts`);

  script = [
    { status:429, body:{}, headers:{'retry-after':'0'} },
    { status:429, body:{}, headers:{'retry-after':'0'} },
    { status:429, body:{}, headers:{'retry-after':'0'} },
  ];
  calls.length = 0;
  msg=''; try { await fetchHistory(51,0); } catch(e:any){ msg=e.message; }
  ck('Retries are bounded and eventually give up', msg.includes('429') && calls.length===3, `${calls.length} attempts, "${msg}"`);

  console.log('\n--- N. Climate projection parsing ---');
  const suffixed: any = { time:['2000-01-01','2000-01-02'] };
  CLIMATE_MODELS.forEach(m => { suffixed[`temperature_2m_max_${m}`]=[20,21]; suffixed[`temperature_2m_mean_${m}`]=[15,16]; });
  script = [{ status:200, body:{ daily: suffixed } }];
  calls.length = 0;
  const models = await fetchProjection(51,0);
  ck('Every requested model is parsed out', Object.keys(models).length===CLIMATE_MODELS.length, Object.keys(models).join(', '));
  ck('Each model carries both variables', Object.values(models).every(m=>m.tmax.length===2 && m.tmean.length===2));
  const cu = new URL(calls[0]);
  ck('Projection requests the declared models', cu.searchParams.get('models')===CLIMATE_MODELS.join(','));

  script = [{ status:200, body:{ daily:{ time:['2000-01-01'] } } }];
  msg=''; try { await fetchProjection(51,0); } catch(e:any){ msg=e.message; }
  ck('A projection with no model series is rejected', msg.length>0, msg);

  console.log('\n--- O. Population ---');
  script = [{ status:200, body:{ status:'finished', data:{ total_population: 9123456.7 } } }];
  calls.length = 0;
  const pop = await fetchPopulation({ north:51.7, south:51.3, east:0.3, west:-0.5 });
  ck('A synchronous population response is parsed and rounded', pop===9123457, String(pop));
  const pu = new URL(calls[0]);
  const gj = JSON.parse(decodeURIComponent(pu.searchParams.get('geojson')!));
  const ring = gj.features[0].geometry.coordinates[0];
  ck('The polygon is closed, as GeoJSON requires',
    ring.length===5 && ring[0][0]===ring[4][0] && ring[0][1]===ring[4][1]);
  ck('The polygon is lon,lat ordered, not lat,lon',
    ring.every((c:number[]) => c[0]>=-0.5 && c[0]<=0.3 && c[1]>=51.3 && c[1]<=51.7));

  script = [
    { status:200, body:{ status:'created', taskid:'abc' } },
    { status:200, body:{ status:'finished', data:{ total_population: 500 } } },
  ];
  calls.length = 0;
  const polled = await fetchPopulation({ north:1, south:0, east:1, west:0 });
  ck('A queued population task is polled to completion', polled===500 && calls.length===2 && calls[1].includes('/tasks/abc'));

  script = [{ status:200, body:{ status:'finished', data:{} } }];
  msg=''; try { await fetchPopulation({north:1,south:0,east:1,west:0}); } catch(e:any){ msg=e.message; }
  ck('A population response with no figure is rejected', msg.length>0, msg);

  console.log('\n--- P. Geometry ---');
  const c = centreOf({ north:52, south:50, east:2, west:-2 });
  ck('Area centre is the midpoint', c.lat===51 && c.lon===0, `${c.lat}, ${c.lon}`);
  const c2 = centreOf({ north:0.5, south:-0.5, east:0.5, west:-0.5 });
  ck('Centre works across the equator and meridian', c2.lat===0 && c2.lon===0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) console.log('FAILED:', fails.join(' | '));
  process.exit(fail?1:0);
};
run();
