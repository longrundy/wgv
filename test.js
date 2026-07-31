/* JSDOM suite for OurWGV.
   The page is a classic script, so top-level `const` bindings live in the
   global lexical scope and never appear on `window`. Everything is therefore
   reached with window.eval rather than window.<name>. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); }
}
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function ok(v, m) { if (!v) throw new Error(m || 'expected truthy'); }
function has(hay, needle, m) { if (!String(hay).includes(needle)) throw new Error((m ? m + ': ' : '') + 'missing ' + JSON.stringify(needle)); }

const html = fs.readFileSync('ourwgv.html', 'utf8');

// ---------------------------------------------------------------- boot
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://longrundy.github.io/wgv/ourwgv.html',
  beforeParse(w) {
    // the page fetches its Content tab on load; keep it offline and quiet
    w.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
    w.scrollTo = () => {};
    w.matchMedia = w.matchMedia || (q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  }
});
const { window } = dom;
const doc = window.document;
const G = expr => window.eval(expr);
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));

const EMP = G('EMP'), EMP_COPY = G('EMP_COPY'), EMP_SECS = G('EMP_SECS'), state = G('state');
const empThin = G('empThin'), empSec = G('empSec');
const EMP_PLAIN = G('EMP_PLAIN');
const EMP_MIN_N = G('EMP_MIN_N'), EMP_MIN_PART = G('EMP_MIN_PART');

// unlock the gate and put the app into the employee feedback view
$('#app').removeAttribute('hidden');
if ($('#gate')) $('#gate').setAttribute('hidden', '');
state.svAud = 'employee';
const item = { t: 'Feedback', surveys: true };
function render(sec) { state.empSec = sec; G('detailEmployee')(item); return $('#detail').innerHTML; }
const EMP_SECS_KEYS = EMP_SECS.map(x => x[0]);

// ---------------------------------------------------------------- structural
t('document parses and titles correctly', () => has(doc.title, 'OurWGV'));

t('brand palette intact in :root', () => {
  const css = html.slice(html.indexOf(':root{'), html.indexOf(':root{') + 400);
  has(css, '#17325a', 'navy'); has(css, '#c8161d', 'red'); has(css, '#639922', 'green');
});

t('no new pink or dusty rose introduced', () => {
  // tints already in the file before this change are grandfathered; nothing new may appear
  const allowed = new Set(['#fbeceb', '#fbf6f6', '#fcebeb', '#f3dcdc', '#fdf7f7', '#fdeeee',
                           '#fdf3f3', '#faeceb', '#f4a3a3']);
  const body = html.replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,');
  const rose = [];
  new Set((body.match(/#[0-9a-fA-F]{6}\b/g) || []).map(h => h.toLowerCase())).forEach(h => {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510;
    if (mx === mn) return;
    let hue = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    hue = (hue * 60 + 360) % 360;
    if ((hue <= 20 || hue >= 320) && l > 0.70 && !allowed.has(h)) rose.push(h);
  });
  eq(rose.length, 0, 'new pink/rose colours ' + rose.join(', '));
});

t('password gate exists in the markup', () => ok($('#gate'), 'gate element'));

// ---------------------------------------------------------------- copy block
t('every topic has a plain-language name', () => {
  Object.keys(EMP.avg).forEach(k => {
    ok(EMP_PLAIN[k], 'no plain name for ' + k);
    ok(EMP_PLAIN[k] === EMP_PLAIN[k].toLowerCase(), EMP_PLAIN[k] + ' should be lower case');
  });
});

t('no CultureMonkey vocabulary reaches the screen', () => {
  const banned = ['eNPS', 'Driver', 'driver', 'leverage', 'Leverage', 'Purpose Alignment',
                  'Work Environment', 'Social Connection', 'Growth & Development', 'Rewards',
                  'FB Front of House', 'FB Back of House'];
  ['summary', 'detail'].forEach(sec => {
    ['topics', 'teams', 'rec', 'wrote'].forEach(det => {
      state.empSec = sec; state.empDet = det; state.empDept = null;
      G('detailEmployee')(item);
      const txt = $('.detail-body').textContent;
      banned.forEach(b => ok(!txt.includes(b), sec + '/' + det + ' leaks "' + b + '"'));
    });
  });
});

t('prose counts still match the data', () => {
  eq(EMP_COPY.counts.responses, EMP.propN);
  const payroll = Math.round(EMP.propN / (EMP.propPart / 100));
  ok(Math.abs(EMP_COPY.counts.payroll - payroll) <= 1, 'payroll prose vs implied');
});

t('deptNote and courseNote keys all resolve', () => {
  const names = EMP.depts.map(d => d.n), ids = EMP.courses.map(c => c.id);
  Object.keys(EMP_COPY.deptNote).forEach(k => ok(names.includes(k), 'orphan deptNote ' + k));
  Object.keys(EMP_COPY.courseNote).forEach(k => ok(ids.includes(k), 'orphan courseNote ' + k));
});

// ------------------------------------------------- the correction that mattered
t('each team is shown its OWN lowest score, not an impact-weighted pick', () => {
  EMP.depts.forEach(dp => {
    const lo = G('empLowest')(dp);
    const trueMin = Math.min.apply(null, Object.keys(dp.s).map(k => dp.s[k]));
    eq(lo.score, trueMin, dp.n + ' lowest score');
  });
});

t('Agronomy surfaces pay at 5.7, not autonomy', () => {
  const ag = EMP.depts.find(d => d.n === 'Agronomy');
  const lo = G('empLowest')(ag);
  eq(lo.k, 'Rewards', 'Agronomy lowest topic');
  eq(lo.score, 5.7);
  state.empSec = 'summary'; state.empDept = null; G('detailEmployee')(item);
  const row = $$('.emp-srow').find(r => r.textContent.includes('Agronomy'));
  has(row.textContent, 'pay and benefits');
  has(row.textContent, '5.7');
  ok(!row.textContent.includes('trusted'), 'must not name autonomy');
});

t('Golf OS Services surfaces progression at 6.7, not working conditions', () => {
  const g = EMP.depts.find(d => d.n === 'Golf OS Services');
  eq(G('empLowest')(g).score, 6.7);
  state.empSec = 'summary'; state.empDept = null; G('detailEmployee')(item);
  const row = $$('.emp-srow').find(r => r.textContent.includes('Golf OS Services'));
  has(row.textContent, 'chances to learn and move up');
});

t('a gap inside the noise band reads as level, not as a difference', () => {
  const golf = EMP.depts.find(d => d.n === 'Golf');
  const lo = G('empLowest')(golf);
  ok(Math.abs(lo.gap) <= G('EMP_NOISE'), 'Golf lowest gap is within noise');
  state.empSec = 'summary'; state.empDept = null; G('detailEmployee')(item);
  const row = $$('.emp-srow').find(r => r.textContent.trim().startsWith('Golf') &&
                                        !r.textContent.includes('OS Services'));
  has(row.textContent, 'level with the property');
});

// ---------------------------------------------------------------- summary
t('summary separates rating from recommending', () => {
  state.empSec = 'summary'; state.empDept = null; G('detailEmployee')(item);
  const cols = $$('.emp-two > .emp-col');
  eq(cols.length, 2, 'two labelled columns');
  has(cols[0].textContent, 'rate working here');
  has(cols[0].querySelector('.emp-kbig').textContent, EMP.propOverall.toFixed(1));
  has(cols[1].textContent, 'recommend');
  ok(cols[1].querySelector('.emp-split'), 'recommend shown as a bar');
  has(cols[1].textContent, 'can rate us well and still not recommend');
});

t('the recommend bar uses real counts from the data', () => {
  state.empSec = 'summary'; G('detailEmployee')(item);
  const segs = $$('.emp-split > div').map(d => parseInt(d.textContent, 10));
  const pro = EMP.courses.reduce((a, c) => a + c.adv.pro, 0);
  const pas = EMP.courses.reduce((a, c) => a + c.adv.pas, 0);
  const det = EMP.courses.reduce((a, c) => a + c.adv.det, 0);
  eq(segs.join(','), [pro, pas, det].join(','));
});

t('teams are ordered largest first, not by score', () => {
  state.empSec = 'summary'; state.empDept = null; G('detailEmployee')(item);
  const counts = $$('.emp-srow:not(.emp-shead) .emp-sa')
    .map(e => parseInt(e.textContent, 10));
  for (let i = 1; i < counts.length; i++) ok(counts[i] <= counts[i - 1], 'descending by headcount');
  const first = $$('.emp-srow:not(.emp-shead)')[0];
  has(first.textContent, 'Golf OS Services', 'biggest team leads');
});

t('recommending is worded, with the number kept alongside', () => {
  state.empSec = 'summary'; G('detailEmployee')(item);
  const words = $$('.emp-srow:not(.emp-shead) .emp-sr').map(e => e.textContent);
  ok(words.some(x => x.includes('mixed')), 'mixed present');
  ok(words.some(x => x.includes('strongly positive')), 'strongly positive present');
  ok(words.some(x => x.includes('negative')), 'negative present');
  words.forEach(x => ok(/[+\u2212-]?\d+/.test(x), 'number retained: ' + x));
});

t('thin teams say so instead of naming a priority', () => {
  state.empSec = 'summary'; state.empDept = null; G('detailEmployee')(item);
  EMP.depts.filter(G('empThin')).forEach(dp => {
    const row = $$('.emp-srow').find(r => r.textContent.includes(G('empTeam')(dp.n)));
    has(row.textContent, 'too few to read', dp.n);
  });
});

t('departments are renamed for humans', () => {
  state.empSec = 'summary'; G('detailEmployee')(item);
  const txt = $('.detail-body').textContent;
  has(txt, 'Front of house'); has(txt, 'Kitchen');
});

// ---------------------------------------------------------------- leader card
t('clicking a team opens its card', () => {
  state.empSec = 'summary'; state.empDept = null; G('detailEmployee')(item);
  eq($$('.emp-card').length, 0, 'no card until asked');
  $$('[data-empd]').find(b => b.dataset.empd === 'Agronomy').click();
  const c = $('.emp-card');
  ok(c, 'card opened');
  has(c.textContent, 'Agronomy');
  has(c.textContent, '8.4 out of 10');
  has(c.textContent, 'Strongest');
  has(c.textContent, 'Rated lowest');
  has(c.textContent, 'pay and benefits');
});

t('clicking the same team again closes the card', () => {
  state.empSec = 'summary'; state.empDept = 'Agronomy'; G('detailEmployee')(item);
  $$('[data-empd]').find(b => b.dataset.empd === 'Agronomy').click();
  eq($$('.emp-card').length, 0);
});

t('the card states the team against the property, in words', () => {
  state.empSec = 'summary'; state.empDept = 'Golf OS Services'; G('detailEmployee')(item);
  has($('.emp-cline').textContent, 'below the property');
  has($('.emp-cline').textContent, EMP.propOverall.toFixed(1));
});

t('a thin team carries its caution inside the card', () => {
  state.empSec = 'summary'; state.empDept = 'FB Back of House'; G('detailEmployee')(item);
  ok($('.emp-card .emp-caution'), 'caution present');
  has($('.emp-card').textContent, '4 of 6 answered');
  has($('.emp-card').textContent, "AJ's", 'restaurant note travels with the card');
});

// ---------------------------------------------------------------- detail
t('detail offers four sub-sections', () => {
  state.empSec = 'detail'; G('detailEmployee')(item);
  const subs = $$('[data-empdet]').map(b => b.dataset.empdet);
  eq(subs.join(','), 'topics,teams,rec,wrote');
  eq($$('[data-empdet][aria-pressed="true"]').length, 1);
});

t('all twelve topics render per course, highest score first', () => {
  state.empSec = 'detail'; state.empDet = 'topics'; G('detailEmployee')(item);
  const cols = $$('.emp-two > .emp-col');
  eq(cols.length, 2);
  cols.forEach((c, i) => {
    const rows = Array.from(c.querySelectorAll('.emp-trow:not(.emp-thead)'));
    eq(rows.length, 12, 'column ' + i);
    const v = rows.map(r => parseFloat(r.querySelector('.emp-tsc').textContent));
    for (let k = 1; k < v.length; k++) ok(v[k] <= v[k - 1], 'descending by score');
  });
});

t('impact is shown as dots, never as a coefficient', () => {
  state.empSec = 'detail'; state.empDet = 'topics'; G('detailEmployee')(item);
  const dots = $$('.emp-dots');
  eq(dots.length, 24, 'one per topic per course');
  dots.forEach(d => ok(/^\u25cf{1,3}$/.test(d.textContent), 'dots only: ' + d.textContent));
  ok(!$('.detail-body').textContent.includes('0.99'), 'no raw coefficient on screen');
});

t('pay gets one dot on both courses', () => {
  state.empSec = 'detail'; state.empDet = 'topics'; G('detailEmployee')(item);
  const payRows = $$('.emp-trow').filter(r => r.textContent.includes('pay and benefits'));
  eq(payRows.length, 2);
  payRows.forEach(r => eq(r.querySelector('.emp-dots').textContent, '\u25cf'));
});

t('each team detail still shows the full twelve-topic comparison', () => {
  state.empSec = 'detail'; state.empDet = 'teams'; state.empDept = 'Agronomy';
  G('detailEmployee')(item);
  ok($('.emp-gapsvg'), 'gap chart present');
  const labels = $$('.emp-gapsvg text').map(t => t.textContent);
  Object.keys(EMP.avg).forEach(k => ok(labels.includes(EMP_PLAIN[k]), 'missing ' + EMP_PLAIN[k]));
});

t('recommending shows both courses with the eleven-row spread', () => {
  state.empSec = 'detail'; state.empDet = 'rec'; G('detailEmployee')(item);
  const cols = $$('.emp-two > .emp-col');
  eq(cols.length, 2);
  cols.forEach(c => eq(c.querySelectorAll('.emp-drow').length, 11));
});

t('the +34 / +35 caveat appears only under Slammer & Squire', () => {
  state.empSec = 'detail'; state.empDet = 'rec'; G('detailEmployee')(item);
  const cols = $$('.emp-two > .emp-col');
  eq(cols[0].querySelectorAll('.emp-note.flag').length, 0);
  const f = cols[1].querySelector('.emp-note.flag');
  ok(f, 'caveat present');
  ['+34', '+35', 'heatmap export', 'location report'].forEach(x => has(f.textContent, x));
});

t('what people wrote reports King & Bear as missing, not blank', () => {
  state.empSec = 'detail'; state.empDet = 'wrote'; G('detailEmployee')(item);
  has($$('.emp-two > .emp-col')[0].textContent, 'Not available');
  has($$('.emp-two > .emp-col')[1].textContent, 'What to keep doing');
});

t('paired panels keep two columns with a divider', () => {
  has(html, '.emp-two>.emp-col:first-child{padding-right:24px;border-right:1px solid');
});

// ---------------------------------------------------------------- scroll preservation
/* jsdom never resets scrollTop on its own, so a naive assertion would pass even
   if the code dropped the restore. Zero it on every innerHTML write, the way a
   browser does, and the assertion becomes real. */
function instrument(pane) {
  let v = 0;
  const d = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
  Object.defineProperty(pane, 'scrollTop', { get: () => v, set: x => { v = x; }, configurable: true });
  Object.defineProperty(pane, 'innerHTML', {
    get() { return d.get.call(this); },
    set(h) { d.set.call(this, h); v = 0; },
    configurable: true
  });
  return () => v;
}

t('section switch preserves scroll position', () => {
  render('summary');
  const pane = $('#detail'), read = instrument(pane);
  pane.scrollTop = 420;
  $$('[data-emp]').find(b => b.dataset.emp === 'detail').click();
  eq(read(), 420, 'scroll restored after re-render');
  eq(empSec(), 'detail', 'section actually changed');
});

t('team row click preserves scroll position', () => {
  state.empDept = null;
  render('summary');
  const pane = $('#detail'), read = instrument(pane);
  pane.scrollTop = 260;
  $$('[data-empd]').find(b => b.dataset.empd === 'Agronomy').click();
  eq(read(), 260, 'scroll restored');
  eq(state.empDept, 'Agronomy', 'selection changed');
});

// ---------------------------------------------------------------- wiring
t('sub-section pills preserve scroll too', () => {
  state.empSec = 'detail'; state.empDet = 'topics'; G('detailEmployee')(item);
  const pane = $('#detail'), read = instrument(pane);
  pane.scrollTop = 300;
  $$('[data-empdet]').find(b => b.dataset.empdet === 'teams').click();
  eq(read(), 300, 'scroll restored');
  eq(G('empDet')(), 'teams');
});

t('every section pill is clickable and switches state', () => {
  render('summary');
  EMP_SECS.forEach(([k]) => {
    const b = $$('[data-emp]').find(x => x.dataset.emp === k);
    ok(b, 'pill ' + k + ' present');
    b.click();
    eq(empSec(), k, 'switched to ' + k);
  });
});

t('aria-pressed tracks the active pill', () => {
  EMP_SECS.forEach(([k]) => {
    render(k);
    const on = $$('[data-emp][aria-pressed="true"]');
    eq(on.length, 1, 'exactly one pressed on ' + k);
    eq(on[0].dataset.emp, k);
  });
});

t('department names survive the round trip into data attributes', () => {
  state.empSec = 'summary';
  render('summary');
  const names = $$('[data-empd]').map(b => b.dataset.empd);
  ok(names.includes('FB Back of House'), 'name present');
  ok(names.every(n => EMP.depts.some(d => d.n === n)), 'no mangled names');
});

t('all five teams render as rows', () => {
  state.empDept = null; render('summary');
  eq($$('.emp-srow:not(.emp-shead)').length, EMP.depts.length);
});

// ---------------------------------------------------------------- rail mark
t('the rail carries the animated webp mark', () => {
  const img = $('.brand .brand-mark');
  ok(img, 'brand-mark img present in the rail');
  ok(/^data:image\/webp;base64,/.test(img.getAttribute('src')), 'rail mark is a webp data URI');
  eq(img.getAttribute('alt'), 'World Golf Village', 'alt text kept');
});

t('the rail mark declares its intrinsic size so the rail does not jump', () => {
  const img = $('.brand .brand-mark');
  eq(img.getAttribute('width'), '188');
  eq(img.getAttribute('height'), '225');
});

t('the rail mark is a real animated webp with an alpha channel', () => {
  const b64 = $('.brand .brand-mark').getAttribute('src').split(',')[1];
  const buf = Buffer.from(b64, 'base64');
  eq(buf.slice(0, 4).toString('latin1'), 'RIFF', 'RIFF container');
  eq(buf.slice(8, 12).toString('latin1'), 'WEBP', 'webp payload');
  const head = buf.slice(0, 4096).toString('latin1');
  ok(head.includes('VP8X'), 'extended format header');
  ok(head.includes('ANIM'), 'animation chunk');
  const frames = (buf.toString('latin1').match(/ANMF/g) || []).length;
  ok(frames > 10, 'has multiple frames, got ' + frames);
  // VP8X feature byte: bit 4 = alpha, bit 1 = animation
  const flags = buf[buf.indexOf('VP8X', 0, 'latin1') + 8];
  ok(flags & 0x10, 'alpha flag set');
  ok(flags & 0x02, 'animation flag set');
});

t('the gate and mobile topbar keep the original still logo', () => {
  const gate = $('.gate img'), bar = $('.topbar img');
  ok(gate, 'gate logo present');
  ok(/^data:image\/png;base64,/.test(gate.getAttribute('src')), 'gate logo untouched');
  ok(bar, 'topbar logo present');
  ok(/^data:image\/png;base64,/.test(bar.getAttribute('src')), 'topbar logo untouched');
});

t('exactly one of the three logo copies was replaced', () => {
  // the file also holds an unrelated webp (the hours signpost photo), so count
  // the logo images specifically rather than every webp data URI
  const railSrc = $('.brand .brand-mark').getAttribute('src');
  eq(html.split(railSrc).length - 1, 1, 'animated mark appears once');
  const png = $('.gate img').getAttribute('src');
  eq(html.split(png).length - 1, 2, 'still PNG logo remains on the gate and topbar only');
});

t('a still frame is served under prefers-reduced-motion', () => {
  const i = html.indexOf('@media (prefers-reduced-motion:reduce)');
  ok(i > -1, 'media query present');
  const rule = html.slice(i, i + 400);
  has(rule, '.brand-mark');
  has(rule, 'content:url("data:image/webp;base64,');
});

t('the reduced-motion still is a static webp, not the animation again', () => {
  const m = html.match(/prefers-reduced-motion:reduce\)\{\s*\.brand-mark\{content:url\("data:image\/webp;base64,([A-Za-z0-9+/=]+)"\)\}/);
  ok(m, 'still frame extracted');
  const buf = Buffer.from(m[1], 'base64');
  eq(buf.slice(8, 12).toString('latin1'), 'WEBP', 'webp payload');
  eq((buf.toString('latin1').match(/ANMF/g) || []).length, 0, 'still frame carries no animation frames');
  const anim = Buffer.from($('.brand .brand-mark').getAttribute('src').split(',')[1], 'base64');
  ok(buf.length < anim.length / 4, 'still is much smaller than the animation');
});

t('the rail logo renders at its original 94px', () => {
  const i = html.indexOf('.brand img{');
  const rule = html.slice(i, i + 60);
  has(rule, 'width:94px');
  ok(!rule.includes('width:85px'), 'the 10% reduction was rolled back with it');
});

t('the rail mark stays within its size budget', () => {
  // the white-rim guarantee is asserted at build time in mkflag3.py, where the
  // webp can actually be decoded; node only checks the byte budget here
  const b64 = $('.brand .brand-mark').getAttribute('src').split(',')[1];
  const kb = Buffer.from(b64, 'base64').length / 1024;
  ok(kb < 200, 'mark is ' + kb.toFixed(1) + 'KB, budget 200KB');
});

t('the rail mark sits inside the existing public-site link', () => {
  const a = $('.brand .brand-link');
  ok(a, 'link preserved');
  has(a.getAttribute('href'), 'golfwgv.com');
  ok(a.contains($('.brand-mark')), 'mark is inside the link');
});

// ---------------------------------------------------------------- report
console.log('\n' + '-'.repeat(58));
console.log('  passed ' + pass + '   failed ' + fail);
if (fails.length) { console.log('-'.repeat(58)); fails.forEach(f => console.log('  FAIL  ' + f)); }
console.log('-'.repeat(58) + '\n');
process.exit(fail ? 1 : 0);
