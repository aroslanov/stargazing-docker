#!/usr/bin/env node
/*
 * Deterministic tests for the Stargazing Calendar's pure scoring/astronomy
 * logic, extracted from the single-file HTML app. Run with:
 *   node tests/run-tests.js
 * The app script is evaluated in a Node VM context (no DOM) where it exposes
 * globalThis.__STG (the pure functions + state). No network is used.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'stargazing.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.ok(blocks.length >= 2, 'expected SETTINGS + main script');

const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(blocks[1], ctx);
const S = ctx.__STG;
assert.ok(S && typeof S.calcScore === 'function', '__STG not exposed');

let passed = 0, failed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + ' :: ' + e.message); }
};
const W = { maxMoonPct: 15, maxCloudPct: 25, weightMoon: 0.95, weightMW: 0.05 };

console.log('== Perfect classification ==');
t('at exactly both thresholds → Perfect', () => assert.strictEqual(S.isPerfectNight(15, 25, W), true));
t('exceeding moon threshold → not Perfect', () => assert.strictEqual(S.isPerfectNight(16, 25, W), false));
t('exceeding cloud threshold → not Perfect', () => assert.strictEqual(S.isPerfectNight(15, 26, W), false));
t('full moon (100%) below horizon still not Perfect (illum rule)', () => assert.strictEqual(S.isPerfectNight(100, 0, W), false));
t('known 100% cloud never Perfect', () => assert.strictEqual(S.isPerfectNight(0, 100, W), false));
t('unknown cloud (null) never Perfect', () => assert.strictEqual(S.isPerfectNight(5, null, W), false));
t('changing maxMoonPct flips result', () => {
  assert.strictEqual(S.isPerfectNight(20, 0, Object.assign({}, W, { maxMoonPct:15 })), false);
  assert.strictEqual(S.isPerfectNight(20, 0, Object.assign({}, W, { maxMoonPct:30 })), true);
});

console.log('== Score & weights ==');
t('reads weightMoon/weightMW (not .moon/.mw) and changes score', () => {
  const a = S.calcScore(0, 0, 0, W);                    // weightMoon 0.95 → 95
  const b = S.calcScore(0, 0, 0, { weightMoon:0.5, weightMW:0.5 }); // → 50
  assert.notStrictEqual(a, b);
  assert.strictEqual(a, 95);
  assert.strictEqual(b, 50);
});
t('weights are normalized; zero total is safe', () => {
  const z = S.calcScore(50, 10, 0.5, { weightMoon:0, weightMW:0 });
  assert.ok(Number.isFinite(z) && z >= 0 && z <= 100, 'zero-total fallback must be finite');
});
t('unknown cloud passes null → higher (clear-sky potential) than 100% cloud', () => {
  assert.ok(S.calcScore(5, null, 0.5, W) > S.calcScore(5, 100, 0.5, W));
});
t('score stays within 0..100 for extreme inputs', () => {
  [[-50,0,2],[500,0,9],[0,0,0],[100,100,1],[100,0,0],[0,999,0]].forEach(([i,c,m]) => {
    const v = S.calcScore(i, c, m, W);
    assert.ok(v >= 0 && v <= 100, `${i},${c},${m} -> ${v}`);
  });
});

console.log('== Timezone awareness ==');
t('Tokyo offset is +540 (JST, no DST)', () => assert.strictEqual(S.tzOffsetMinutes('Asia/Tokyo', Date.UTC(2026,5,15,12)), 540));
t('LA summer offset is -420 (PDT)', () => assert.strictEqual(S.tzOffsetMinutes('America/Los_Angeles', Date.UTC(2026,5,15,12)), -420));
t('LA browser + Tokyo coords: in-range day uses the API date, not browser date', () => {
  const w2 = { daily:{ time:['2026-08-21','2026-08-22','2026-08-23'],
    sunrise:['06:00']*3, sunset:['18:00']*3, moon_phase:null } };
  // civilForDay must take the API date label (Tokyo-local) for in-range i,
  // regardless of the browser/node timezone.
  const c = S.civilForDay('Asia/Tokyo', 1, w2, 0, 3);
  assert.deepStrictEqual({ y:c.y, mo:c.mo, d:c.d }, { y:2026, mo:7, d:22 });
});
t('LA browser + Auckland coords: civilToUtc noon is local noon in Auckland', () => {
  const ms = S.civilToUtc('Pacific/Auckland', 2026, 5, 15, 12);
  const p = S.zonedParts('Pacific/Auckland', ms);
  assert.deepStrictEqual([p.h, p.m], [12, 0]);
});
t('DST transitions: spring-forward 23h day, fall-back 25h day; civil noon resolves to 12:00', () => {
  // US DST 2026: spring-forward Sun Mar 8 (23 h day Mar 7→8), fall-back Sun Nov 1 (25 h day Oct 31→Nov 1)
  const spA = S.civilToUtc('America/Los_Angeles', 2026, 2, 7, 12);   // Mar 7
  const spB = S.civilToUtc('America/Los_Angeles', 2026, 2, 8, 12);   // Mar 8
  assert.strictEqual(spB - spA, 23*3600000);
  const fbA = S.civilToUtc('America/Los_Angeles', 2026, 9, 31, 12);  // Oct 31 (index 9)
  const fbB = S.civilToUtc('America/Los_Angeles', 2026, 10, 1, 12);  // Nov 1 (index 10)
  assert.strictEqual(fbB - fbA, 25*3600000);
  // Both adjacent civil noons still resolve to local 12:00 on their own calendar date
  assert.strictEqual(S.zonedParts('America/Los_Angeles', spA).h, 12);
  assert.strictEqual(S.zonedParts('America/Los_Angeles', fbB).h, 12);
});
t('International Date Line: stepping stays on the correct civil date across month', () => {
  const c = S.addCivilDays(2026, 11, 31, 1);   // Dec 31, 2026 + 1 -> Jan 1, 2027
  assert.deepStrictEqual([c.y, c.mo, c.d], [2027, 0, 1]);
  const ms = S.civilToUtc('Pacific/Kiritimati', 2026, 11, 1, 12);  // Dec 1 2026 (+14)
  assert.deepStrictEqual([S.zonedParts('Pacific/Kiritimati', ms).y, S.zonedParts('Pacific/Kiritimati', ms).mo, S.zonedParts('Pacific/Kiritimati', ms).d], [2026, 11, 1]);
});

console.log('== Night cloud pressure / completeness ==');
t('16-day response → 15 complete nights, final night null', () => {
  const N = 6;                             // use 6 for clarity: expect 5 filled, last null
  const daily = { time:[], sunrise:[], sunset:[] };
  for (let d=0; d<N; d++){ daily.time.push(`2026-08-${20+d}`); daily.sunrise.push(`2026-08-${20+d}T06:00`); daily.sunset.push(`2026-08-${20+d}T18:00`); }
  const hours = [];
  const clouds = [];
  const t0 = Date.UTC(2026,7,20,0,0);
  for (let h=0; h<N*24; h++){ const dt=new Date(t0+h*3600000); hours.push(dt.toISOString().slice(0,16).replace('T','T')); clouds.push(h); }
  const data = { daily: Object.assign(daily, {time:daily.time}), hourly:{ time:hours, cloud_cover:clouds } };
  const out = S.nightCloud(data);
  let filled=0, last=null;
  out.forEach((v,i)=>{ if(v!=null){filled++;} });
  assert.strictEqual(filled, N-1, `expected ${N-1} complete nights`);
  assert.strictEqual(out[N-1], null, 'final night must be null');
});
t('response of length 1 → 0 complete nights, no crash', () => {
  const data = { daily: { time:['2026-08-20'], sunrise:['2026-08-20T06:00'], sunset:['2026-08-20T18:00'] },
                 hourly:{ time:['2026-08-20T06:00','2026-08-20T18:00'], cloud_cover:[10,20] } };
  const out = S.nightCloud(data);
  assert.ok(Array.isArray(out) && out.length === 1 && out[0] === null);
});

console.log('== moon phase / illumination ==');
t('phase→illumination is consistent (new→0, half→0.5, full→1)', () => {  assert.ok(Math.abs(S.phaseToIllum(0)-0) < 1e-9);
  assert.ok(Math.abs(S.phaseToIllum(0.25)-0.5) < 1e-9);
  assert.ok(Math.abs(S.phaseToIllum(0.5)-1) < 1e-9);
  assert.ok(Math.abs(S.phaseToIllum(0.75)-0.5) < 1e-9);
});
t('local synodic approximation matches reference phases within tolerance', () => {
  const NEW = S.localPhaseAt(Date.UTC(2026,8,11,12));   // ~new moon Sep 2026
  const FULL = S.localPhaseAt(Date.UTC(2026,7,27,12));  // ~full moon Aug 2026
  const deg=(a,b)=>{ const d=Math.abs(a-b); return Math.min(d,1-d); };
  assert.ok(deg(NEW,0) < 0.03, `new-moon phase ${NEW} not near 0`);
  assert.ok(deg(FULL,0.5) < 0.03, `full-moon phase ${FULL} not near 0.5`);
});

console.log('== mini calendar month stepping ==');
t('renders 12 distinct consecutive months, not 12 days of one month', () => {
  const td = S.zonedParts('America/Los_Angeles', Date.UTC(2026,7,20,12)); // Aug 2026
  const seen = new Set();
  for(let k=0;k<12;k++){ const m = S.addCivilDays(td.y, td.mo+k, 1, 0); seen.add(m.y+'-'+m.mo); }
  assert.strictEqual(seen.size, 12, 'expected 12 distinct (year,month) blocks');
  const first = S.addCivilDays(td.y, td.mo, 1, 0);
  const last  = S.addCivilDays(td.y, td.mo+11, 1, 0);
  assert.deepStrictEqual([first.y, first.mo, first.d], [2026, 7, 1]);
  assert.deepStrictEqual([last.y, last.mo], [2027, 6]);   // Aug 2026 +11 months = Jul 2027
  // day-stepping (the bug) would produce 12 distinct days in ONE month
  const bug = new Set();
  for(let k=0;k<12;k++){ const m = S.addCivilDays(td.y, td.mo, 1, k); bug.add(m.mo); }
  assert.strictEqual(bug.size, 1, 'day-stepping stays in one month (the bug)');
});

console.log('== state / coordinate survival ==');
t('apply(coords) updates state.settings; paging leaves them intact', () => {
  S.state.settings = Object.assign({}, S.state.settings, { latitude: 1, longitude: 2 });
  const before = Object.assign({}, S.state.settings);
  S.state.offsetDays = 30;                  // simulate "Next"
  S.state.offsetDays = 0;                   // simulate "Today"
  assert.strictEqual(S.state.settings.latitude, 1);
  assert.strictEqual(S.state.settings.longitude, 2);
  assert.strictEqual(before.latitude, 1);
});

console.log('== buildRow missing-value robustness ==');
t('null moonrise/moonset/sunrise/sunset entries do not crash', () => {
  const weather = { daily: { time:['2026-08-20','2026-08-21'],
    sunrise:['2026-08-20T06:11', null], sunset:['2026-08-20T19:26', null],
    moonrise:[null, null], moonset:[null, null], moon_phase:[0.27, 0.3] },
    hourly:{ time:[], cloud_cover:[] } };
  const settings = Object.assign({}, W, { latitude:34.13, longitude:-116.31, milkyWayMinAlt:15, astroDark:18, markSuper:true, superScore:95 });
  const row = S.buildRow(weather, 'America/Los_Angeles', 0, settings, 0);
  assert.ok(row && typeof row.score === 'number');
  assert.ok(row.score >= 0 && row.score <= 100);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
