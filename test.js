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
t('EMP_COPY covers every panel and every tile', () => {
  ok(EMP_COPY, 'EMP_COPY defined');
  ['overview', 'drivers', 'depts', 'adv', 'themes'].forEach(k =>
    ok(EMP_COPY.intro[k] && EMP_COPY.intro[k].length > 20, 'intro.' + k));
  ['Overall', 'eNPS', 'Participation', 'Responses'].forEach(k =>
    ok(EMP_COPY.tile[k], 'tile.' + k));
  ['overviewCalls', 'overviewFoot', 'driversList', 'driversQs', 'advSplit',
   'themes', 'deptsTable', 'deptsPrio'].forEach(k =>
    ok(EMP_COPY.note[k] && EMP_COPY.note[k].length > 30, 'note.' + k));
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

t('courseNote keys all resolve to a real course', () => {
  const ids = EMP.courses.map(c => c.id);
  Object.keys(EMP_COPY.courseNote).forEach(k => ok(ids.includes(k), 'orphan courseNote key ' + k));
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
t('section pills are the five panels, no Start here', () => {
  eq(EMP_SECS.length, 5, 'five pills');
  eq(EMP_SECS.map(x => x[0]).join(','), 'overview,drivers,depts,adv,themes');
  ok(!EMP_SECS.some(x => x[1] === 'Start here'), 'guide pill removed');
});

t('default section is Overview', () => {
  const keep = state.empSec; state.empSec = undefined;
  eq(empSec(), 'overview'); state.empSec = keep;
});

t('no orphaned guide markup or styles remain', () => {
  ['emp-guide', 'emp-gpair', 'emp-gsteps', 'empGuide', 'Start here'].forEach(x =>
    ok(!html.includes(x), 'leftover: ' + x));
});

// ---------------------------------------------------------------- intros stay short
['overview', 'drivers', 'depts', 'adv', 'themes'].forEach(sec => {
  t('intro line on ' + sec + ' is one short sentence', () => {
    render(sec);
    const p = $('.emp-intro');
    ok(p, 'intro present');
    const txt = p.textContent.trim();
    ok(txt.length > 20, 'has content');
    ok(txt.length < 140, 'stays short, got ' + txt.length + ' chars');
  });
});

t('intro sits between the pill strip and the body', () => {
  render('overview');
  const bar = $('.emp-secs'), intro = $('.emp-intro'), grid = $('.emp-grid');
  ok(bar && intro && grid, 'all three present');
  ok(bar.compareDocumentPosition(intro) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'intro after pills');
  ok(intro.compareDocumentPosition(grid) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'body after intro');
});

// ---------------------------------------------------------------- tiles carry their own scale
t('every headline tile states its own scale', () => {
  render('overview');
  $$('.emp-grid > .emp-col').forEach(col => {
    const tiles = Array.from(col.querySelectorAll('.emp-tile'));
    eq(tiles.length, 4, 'four tiles');
    tiles.forEach(tile => {
      const g = tile.querySelector('.emp-tg');
      ok(g && g.textContent.trim().length > 3, 'tile ' + tile.querySelector('.emp-tl').textContent + ' has a gloss');
    });
  });
});

t('the eNPS tile says it is not a percent, right in the tile', () => {
  render('overview');
  const tile = $$('.emp-tile').find(x => x.querySelector('.emp-tl').textContent === 'ENPS');
  ok(tile, 'eNPS tile found');
  has(tile.querySelector('.emp-tg').textContent, 'not a percent');
  has(tile.querySelector('.emp-tg').textContent, '\u2212100 to +100');
});

t('the overall tile names the 0 to 10 scale', () => {
  render('overview');
  const tile = $$('.emp-tile').find(x => x.querySelector('.emp-tl').textContent === 'OVERALL');
  has(tile.querySelector('.emp-tg').textContent, '0\u201310');
});

t('tile gloss keys all match real tile labels', () => {
  render('overview');
  const labels = new Set($$('.emp-tile .emp-tl').map(e => e.textContent));
  Object.keys(EMP_COPY.tile).forEach(k => ok(labels.has(k.toUpperCase()), 'orphan tile key ' + k));
});

// ---------------------------------------------------------------- notes sit in place
t('overview explains the picking rule under the call-out cards', () => {
  render('overview');
  $$('.emp-grid > .emp-col').forEach(col => {
    const note = col.querySelector('.emp-note');
    ok(note, 'note present in column');
    has(note.textContent, '0.60', 'states the impact bar');
    has(note.textContent, 'Drivers', 'points at the next panel');
    const calls = col.querySelectorAll('.emp-call');
    ok(calls[calls.length - 1].compareDocumentPosition(note) & window.Node.DOCUMENT_POSITION_FOLLOWING,
       'note sits after the cards');
  });
});

t('the picking rule in prose matches EMP_LEV in code', () => {
  render('overview');
  has($('.emp-note').textContent, EMP_LEV.toFixed(2));
});

t('overview carries the anonymity and headcount footnote once', () => {
  render('overview');
  const w = $$('.emp-note.wide');
  eq(w.length, 1, 'one footnote');
  has(w[0].textContent, 'anonymous');
  has(w[0].textContent, 'works back to', 'headcount flagged as derived');
});

t('other panels do not carry the overview footnote', () => {
  ['drivers', 'depts', 'adv', 'themes'].forEach(sec => {
    render(sec);
    eq($$('.emp-note.wide').length, 0, sec + ' should not show the overview footnote');
  });
});

t('drivers explains the impact ordering right under the list', () => {
  render('drivers');
  $$('.emp-grid > .emp-col').forEach(col => {
    const notes = Array.from(col.querySelectorAll('.emp-note'));
    ok(notes.length >= 2, 'list note and questions note');
    has(notes[0].textContent, 'Rewards', 'names the low scorer');
    has(notes[0].textContent, '6.8');
    has(notes[0].textContent, '0.19');
    const rows = col.querySelectorAll('.emp-row:not(.emp-rhead)');
    ok(rows[rows.length - 1].compareDocumentPosition(notes[0]) & window.Node.DOCUMENT_POSITION_FOLLOWING,
       'note follows the twelve rows');
  });
});

t('the drivers header says IMPACT rather than LEVERAGE', () => {
  render('drivers');
  has($('.emp-rhead').textContent, 'BY IMPACT');
  ok(!$('.emp-rhead').textContent.includes('LEVERAGE'), 'jargon removed from the header');
});

t('advocacy explains the eNPS arithmetic under the split bar', () => {
  render('adv');
  $$('.emp-grid > .emp-col').forEach(col => {
    const n = col.querySelector('.emp-note');
    ok(n, 'note present');
    has(n.textContent, 'promoter share minus the detractor share');
    ok(col.querySelector('.emp-split').compareDocumentPosition(n) & window.Node.DOCUMENT_POSITION_FOLLOWING,
       'note follows the bar');
  });
});

t('the +34 / +35 caveat appears only in the Slammer & Squire column', () => {
  render('adv');
  const cols = $$('.emp-grid > .emp-col');
  eq(cols[0].querySelectorAll('.emp-note.flag').length, 0, 'King & Bear has no caveat');
  const f = cols[1].querySelector('.emp-note.flag');
  ok(f, 'Slammer & Squire caveat present');
  ['+34', '+35', 'heatmap export', 'location report', '29', '31'].forEach(x => has(f.textContent, x));
  ok(!f.textContent.includes('a day apart'), 'no invented explanation');
});

t('themes explains that the numbers are counts, not scores', () => {
  render('themes');
  const n = $$('.emp-note').find(x => x.textContent.includes('count, not a score'));
  ok(n, 'counts note present');
  has(n.textContent, 'open-text');
});

t('themes still reports King & Bear as missing rather than blank', () => {
  render('themes');
  has($$('.emp-grid > .emp-col')[0].textContent, 'Not available');
});

t('departments notes the three unreported responses under the table', () => {
  render('depts');
  const n = $$('.emp-note').find(x => x.textContent.includes('57 of the 60'));
  ok(n, 'reconciliation note present');
});

t('the department priority card admits its own limitation', () => {
  state.empDept = 'Golf OS Services'; render('depts');
  const sn = $('.emp-subnote');
  ok(sn, 'subnote present');
  has(sn.textContent, 'property-wide impact');
  has(sn.textContent, 'has not sent it');
  ok($('.emp-call.act').contains(sn), 'sits inside the priority card');
});

t('no panel is left without an explanatory note', () => {
  ['overview', 'drivers', 'depts', 'adv', 'themes'].forEach(sec => {
    render(sec);
    ok($$('.emp-note').length > 0, sec + ' has at least one note');
  });
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
  EMP_SECS.forEach(([k]) => {
    render(k);
    const on = $$('[data-emp][aria-pressed="true"]');
    eq(on.length, 1, 'exactly one pressed on ' + k);
    eq(on[0].dataset.emp, k);
  });
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
