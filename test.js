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
const empThin = G('empThin'), empThinWhy = G('empThinWhy'), empSec = G('empSec');
const empFix = G('empFix'), EMP_LEV = G('EMP_LEV');
const EMP_MIN_N = G('EMP_MIN_N'), EMP_MIN_PART = G('EMP_MIN_PART');

// unlock the gate and put the app into the employee feedback view
$('#app').removeAttribute('hidden');
if ($('#gate')) $('#gate').setAttribute('hidden', '');
state.svAud = 'employee';
const item = { t: 'Feedback', surveys: true };
function render(sec) { state.empSec = sec; G('detailEmployee')(item); return $('#detail').innerHTML; }

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
t('EMP_COPY exists with every panel key', () => {
  ok(EMP_COPY, 'EMP_COPY defined');
  ['overview', 'drivers', 'depts', 'adv', 'themes'].forEach(k =>
    ok(EMP_COPY.intro[k] && EMP_COPY.intro[k].length > 40, 'intro.' + k));
  ok(Array.isArray(EMP_COPY.what) && EMP_COPY.what.length, 'what');
  eq(EMP_COPY.nums.length, 4, 'four numbers explained');
  ok(EMP_COPY.why.length, 'why');
  eq(EMP_COPY.steps.length, 4, 'four steps');
  ok(EMP_COPY.cant.length, 'cant');
  ok(EMP_COPY.soft.length, 'soft');
});

t('deptNote keys all match real departments', () => {
  const names = EMP.depts.map(d => d.n);
  Object.keys(EMP_COPY.deptNote).forEach(k => ok(names.includes(k), 'orphan deptNote key ' + k));
});

t('prose counts still match the data', () => {
  eq(EMP_COPY.counts.responses, EMP.propN, 'responses quoted in prose vs propN');
  const payroll = Math.round(EMP.propN / (EMP.propPart / 100));
  ok(Math.abs(EMP_COPY.counts.payroll - payroll) <= 1, 'payroll prose ' + EMP_COPY.counts.payroll + ' vs implied ' + payroll);
  eq(EMP_COPY.counts.part, Math.round(EMP.propPart) + '%', 'participation prose');
});

t('every course named in prose exists in the data', () => {
  const blob = JSON.stringify(EMP_COPY);
  EMP.courses.forEach(c => has(blob, c.name, 'course named'));
});

// ---------------------------------------------------------------- thresholds
t('empThin flags exactly the two soft departments', () => {
  eq(EMP.depts.filter(empThin).map(d => d.n).sort().join('|'),
     'FB Back of House|FB Front of House');
});

t('thresholds are the documented ones', () => { eq(EMP_MIN_N, 8); eq(EMP_MIN_PART, 40); });

t('empThinWhy states the real arithmetic', () => {
  has(empThinWhy(EMP.depts.find(d => d.n === 'FB Back of House')), '4 of 6 answered');
  has(empThinWhy(EMP.depts.find(d => d.n === 'FB Front of House')), '6 of 19 answered');
});

t('healthy departments are not flagged', () => {
  ['Golf', 'Agronomy', 'Golf OS Services'].forEach(n =>
    ok(!empThin(EMP.depts.find(d => d.n === n)), n + ' should not be flagged'));
});

// ---------------------------------------------------------------- sections
t('Start here is the first section pill', () => {
  eq(EMP_SECS[0][0], 'guide'); eq(EMP_SECS[0][1], 'Start here'); eq(EMP_SECS.length, 6);
});

t('default section is still Overview, not the guide', () => {
  const keep = state.empSec; state.empSec = undefined;
  eq(empSec(), 'overview'); state.empSec = keep;
});

// ---------------------------------------------------------------- guide panel
t('guide renders all six headings and both caveat columns', () => {
  const h = render('guide');
  ['What this is', 'The four numbers, and what each one means',
   'Why the lowest score is not the priority', 'What to do with it',
   'What this round cannot tell you', 'Where the numbers are soft'].forEach(x => has(h, x));
  eq($$('.emp-gpair > .emp-col').length, 2, 'caveats sit in two columns');
  eq($$('.emp-gd').length, 4, 'four number definitions');
  eq($$('.emp-gsteps li').length, 4, 'four steps');
});

t('guide explains the scales that get confused', () => {
  const h = render('guide');
  has(h, '\u2212100 to +100', 'eNPS range');
  has(h, '0 to 10', 'score range');
  has(h, 'not a percentage', 'eNPS is not a percentage');
});

t('guide states the Rewards paradox explicitly', () => {
  const h = render('guide');
  ['Rewards', '6.8', '0.19', '0.60'].forEach(x => has(h, x));
});

t('the flagging threshold in prose matches the code', () => {
  has(render('guide'), EMP_LEV.toFixed(2), 'stated leverage bar vs EMP_LEV');
});

t('guide names every known gap', () => {
  const h = render('guide');
  ["AJ's", 'Legends', '57 of the 60', '+34', '+35', 'thematic export'].forEach(x => has(h, x));
});

t('guide panel carries no intro line of its own', () => {
  render('guide'); eq($$('.emp-intro').length, 0, 'guide is the intro');
});

t('the eNPS discrepancy is attributed to both source reports, not guessed at', () => {
  const h = render('guide');
  has(h, 'heatmap export'); has(h, 'location report');
  has(h, '29'); has(h, '31');
  ok(!h.includes('a day apart'), 'no invented explanation for the gap');
});

t('no unverifiable claim about who can see individual responses', () => {
  const h = render('guide');
  has(h, 'anonymous');
  ok(!/Nobody, including/.test(h), 'does not assert what the vendor can see');
});

t('the derived payroll figure is presented as derived', () => {
  has(render('guide'), 'works back to', 'headcount is flagged as an inference');
});

// ---------------------------------------------------------------- intros
['overview', 'drivers', 'depts', 'adv', 'themes'].forEach(sec => {
  t('intro line renders on ' + sec, () => {
    render(sec);
    const p = $('.emp-intro');
    ok(p, 'intro present'); ok(p.textContent.trim().length > 40, 'intro has substance');
  });
});

t('intro sits between the pill strip and the body', () => {
  render('overview');
  const bar = $('.emp-secs'), intro = $('.emp-intro'), grid = $('.emp-grid');
  ok(bar && intro && grid, 'all three present');
  ok(bar.compareDocumentPosition(intro) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'intro after pills');
  ok(intro.compareDocumentPosition(grid) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'body after intro');
});

// ---------------------------------------------------------------- pairing convention
t('paired panels keep two columns with a divider', () => {
  ['overview', 'drivers', 'adv', 'themes'].forEach(sec => {
    render(sec);
    const cols = $$('.emp-grid > .emp-col');
    eq(cols.length, 2, sec + ' column count');
    eq(cols[0].querySelector('.emp-cn').textContent, 'King & Bear', sec + ' first column');
    eq(cols[1].querySelector('.emp-cn').textContent, 'Slammer & Squire', sec + ' second column');
  });
});

t('the divider rule still targets the first column', () => {
  has(html, '.emp-grid>.emp-col:first-child{padding-right:22px;border-right:1px solid');
});

// ---------------------------------------------------------------- department flags
t('departments panel marks the thin rows and only those', () => {
  render('depts');
  eq($$('.emp-dept .emp-dc.warn').map(e => e.closest('.emp-dept').querySelector('.emp-dn').textContent).sort().join('|'),
     'FB Back of House|FB Front of House');
});

t('the asterisk legend appears once and explains itself', () => {
  render('depts');
  eq($$('.emp-legend').length, 1, 'one legend');
  has($('.emp-legend').textContent, 'one person moves it');
  has($('.emp-legend').textContent, String(EMP_MIN_N));
});

t('selecting a thin department shows the caution band', () => {
  state.empDept = 'FB Back of House'; render('depts');
  ok($('.emp-caution'), 'caution shown');
  has($('.emp-caution').textContent, '4 of 6 answered');
});

t('selecting a healthy department shows no caution band', () => {
  state.empDept = 'Golf'; render('depts');
  eq($$('.emp-caution').length, 0, 'no caution for Golf');
});

t('F&B departments carry the restaurant note', () => {
  state.empDept = 'FB Front of House'; render('depts');
  ok($('.emp-dnote'), 'note present');
  has($('.emp-dnote').textContent, "AJ's");
  has($('.emp-dnote').textContent, 'Legends');
});

t('non-F&B departments carry no restaurant note', () => {
  state.empDept = 'Agronomy'; render('depts');
  eq($$('.emp-dnote').length, 0);
});

// ---------------------------------------------------------------- existing behaviour
t('overview still shows four tiles per course', () => {
  render('overview');
  $$('.emp-grid > .emp-col').forEach(c => eq(c.querySelectorAll('.emp-tile').length, 4));
});

t('drivers still lists twelve rows per course, ordered by impact', () => {
  render('drivers');
  $$('.emp-grid > .emp-col').forEach((c, i) => {
    const rows = Array.from(c.querySelectorAll('.emp-row:not(.emp-rhead)'));
    eq(rows.length, 12, 'column ' + i + ' row count');
    const v = rows.map(r => parseFloat(r.querySelector('.emp-di').textContent));
    for (let k = 1; k < v.length; k++) ok(v[k] <= v[k - 1], 'impact descending in column ' + i);
  });
});

t('where-to-act still picks a soft high-leverage driver', () => {
  EMP.courses.forEach(c => {
    const f = empFix(c);
    ok(f, c.name + ' has a fix');
    ok(f[1] < c.o, c.name + ' fix is below course overall');
    ok(f[2] >= EMP_LEV, c.name + ' fix is at or above the leverage bar');
  });
});

t('themes still reports King & Bear as missing rather than blank', () => {
  render('themes');
  has($$('.emp-grid > .emp-col')[0].textContent, 'Not available');
});

t('advocacy still renders eleven distribution rows per course', () => {
  render('adv');
  $$('.emp-grid > .emp-col').forEach(c => eq(c.querySelectorAll('.emp-drow').length, 11));
});

t('department count still reconciles the way the guide claims', () => {
  eq(EMP.depts.reduce((a, d) => a + d.cnt, 0), 57, 'departments account for 57');
  eq(EMP.propN, 60, 'property total');
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
  render('overview');
  const pane = $('#detail'), read = instrument(pane);
  pane.scrollTop = 420;
  $$('[data-emp]').find(b => b.dataset.emp === 'drivers').click();
  eq(read(), 420, 'scroll restored after re-render');
  eq(empSec(), 'drivers', 'section actually changed');
});

t('department row click preserves scroll position', () => {
  render('depts');
  const pane = $('#detail'), read = instrument(pane);
  pane.scrollTop = 260;
  $$('[data-empd]').find(b => b.dataset.empd === 'Agronomy').click();
  eq(read(), 260, 'scroll restored');
  eq(state.empDept, 'Agronomy', 'selection changed');
});

t('switching into the guide preserves scroll position too', () => {
  render('overview');
  const pane = $('#detail'), read = instrument(pane);
  pane.scrollTop = 133;
  $$('[data-emp]').find(b => b.dataset.emp === 'guide').click();
  eq(read(), 133);
  eq(empSec(), 'guide');
});

// ---------------------------------------------------------------- wiring
t('every section pill is clickable and switches state', () => {
  render('overview');
  EMP_SECS.forEach(([k]) => {
    const b = $$('[data-emp]').find(x => x.dataset.emp === k);
    ok(b, 'pill ' + k + ' present');
    b.click();
    eq(empSec(), k, 'switched to ' + k);
  });
});

t('aria-pressed tracks the active pill', () => {
  render('guide');
  const on = $$('[data-emp][aria-pressed="true"]');
  eq(on.length, 1, 'exactly one pressed');
  eq(on[0].dataset.emp, 'guide');
});

t('department names survive the round trip into data attributes', () => {
  render('depts');
  const names = $$('[data-empd]').map(b => b.dataset.empd);
  ok(names.includes('FB Back of House'), 'name present');
  ok(names.every(n => EMP.depts.some(d => d.n === n)), 'no mangled names');
});

t('all five departments render as rows', () => {
  render('depts');
  eq($$('.emp-dept:not(.emp-rhead)').length, EMP.depts.length);
});

// ---------------------------------------------------------------- report
console.log('\n' + '-'.repeat(58));
console.log('  passed ' + pass + '   failed ' + fail);
if (fails.length) { console.log('-'.repeat(58)); fails.forEach(f => console.log('  FAIL  ' + f)); }
console.log('-'.repeat(58) + '\n');
process.exit(fail ? 1 : 0);
