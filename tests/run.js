'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    console.error('  ✗', name, '\n   ', e.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function approx(a, b, eps) { assert(Math.abs(a - b) <= (eps || 0.01), `expected ~${b}, got ${a}`); }

const ctx = {
  console,
  window: {},
  document: { querySelectorAll: () => [], documentElement: { lang: 'ar', dir: 'rtl' } },
  fetch: async () => { throw new Error('no network in tests'); }
};
vm.createContext(ctx);
const EXPORTS = {
  'i18n.js': 'globalThis.I18n=I18n;',
  'kb.js': 'globalThis.KB=KB;',
  'retrieval.js': 'globalThis.Retrieval=Retrieval;',
  'calculators.js': 'globalThis.Calc=Calc;'
};
['i18n.js', 'kb.js', 'retrieval.js', 'calculators.js'].forEach(f => {
  vm.runInContext(
    fs.readFileSync(path.join(root, 'renderer', 'js', f), 'utf8') + '\n;' + EXPORTS[f],
    ctx, { filename: f });
});
const { I18n, KB, Retrieval, Calc } = ctx;

const sample = JSON.parse(fs.readFileSync(path.join(root, 'renderer', 'data', 'kb-sample.json'), 'utf8'));

console.log('\n— Knowledge base —');
test('loads 2 KBs and 9 documents', () => {
  KB.load(sample);
  assert(KB.kbs.length === 2);
  assert(KB.index.length === 9, 'expected 9 docs, got ' + KB.index.length);
});
test('get by id', () => {
  assert(KB.get('sa-labor-law').type === 'law');
});
test('relations resolve to real documents', () => {
  const { outgoing, incoming } = KB.relationsOf('sa-labor-law');
  assert(outgoing.length >= 3);
  assert(outgoing.every(r => r.targetDoc), 'all outgoing targets resolve');
  assert(incoming.some(r => r.sourceDoc.id === 'sa-ruling-labor-1'), 'ruling cites labor law');
});
test('search finds labor law for "مكافأة نهاية الخدمة" (top-2)', () => {
  const r = KB.search('مكافأة نهاية الخدمة');
  assert(r.length >= 2);
  assert(['sa-labor-law', 'sa-ruling-labor-1'].includes(r[0].doc.id));
  assert(r.slice(0, 2).some(x => x.doc.id === 'sa-labor-law'));
});
test('search works in English too', () => {
  const r = KB.search('end of service award');
  assert(r.length >= 2);
  assert(r.slice(0, 2).some(x => x.doc.id === 'sa-labor-law'));
});
test('v1.6.9: single-token partial match still returns results', () => {
  const r = KB.search('\u0645\u0643\u0627\u0641');
  assert(r.length >= 1, 'partial single-token query should match');
});
test('v1.6.11: results carry a snippet from the matched text; title matches rank first', () => {
  const r = KB.search('مكافأة نهاية الخدمة', 200);
  assert(r.length >= 2);
  assert(r.every(x => typeof x.snippet === 'string'), 'snippet field present');
  assert(r.some(x => x.snippet.includes('مكاف')), 'snippet contains matched term');
  assert(r[0].doc.id === 'sa-labor-law' || r[0].doc.id === 'sa-ruling-labor-1', 'title/body match ranks first');
});

test('v1.6.12: exact title phrase ranks first', () => {
  const r = KB.search('اتفاقية برنامج المحتوى المحلي', 200);
  assert(r.length >= 1);
  assert(r[0].doc.id === 'sa-agreement-icv', 'title-phrase doc first, got ' + r[0].doc.id);
});
test('v1.6.12: searchScore marks title-phrase hits strong with title boost', () => {
  const entry = KB.index.find(e => e.doc.id === 'sa-labor-law');
  const qTokens = KB.tokenize('نظام العمل');
  const r = KB.searchScore(entry, qTokens, qTokens.join(' '));
  assert(r && r.strong === true, 'title phrase is strong');
  assert(r.score >= 100, 'title phrase boost applied, got ' + r.score);
});
test('v1.6.12: rebuild dedupes colliding doc ids', () => {
  const clone = JSON.parse(JSON.stringify(sample));
  const kbs = clone.kbs || clone;
  const dup = JSON.parse(JSON.stringify(kbs[0].documents[0]));
  const baseId = dup.id;
  kbs[0].documents.push(dup);
  KB.load(clone);
  const ids = KB.index.map(e => e.doc.id);
  assert(new Set(ids).size === ids.length, 'ids unique after rebuild');
  const titles = KB.index.filter(e => e.doc.id.startsWith(baseId)).length;
  assert(titles === 2, 'both docs survive with distinct ids');
  KB.load(sample);
});

console.log('\n— Grounded retrieval —');
test('builds passages from articles, versions and relations', () => {
  Retrieval.build();
  assert(Retrieval.passages.length > 20);
  assert(Retrieval.passages.some(p => p.kind === 'article'));
  assert(Retrieval.passages.some(p => p.kind === 'version'));
});
test('extractive answer cites only KB passages', () => {
  const res = Retrieval.extractiveAnswer('متى يستحق العامل مكافأة نهاية الخدمة عند الاستقالة؟');
  assert(res.passages.length > 0, 'should find passages');
  assert(res.citations.every(c => KB.get(c.docId)), 'all citations resolve to KB docs');
  assert(res.answer.includes('['), 'answer carries [n] markers');
});
test('refuses unknown questions instead of guessing', () => {
  const res = Retrieval.extractiveAnswer('ما هو سعر البيتكوين اليوم؟');
  assert(res.passages.length === 0);
  assert(res.answer === I18n.t('chatNoAnswer'));
});
test('document scope restricts retrieval to doc + relations', () => {
  const scope = Retrieval.scopeDocIds('sa-labor-law', 1);
  assert(scope.has('sa-labor-law') && scope.has('sa-reg-hr'));
  const res = Retrieval.retrieve('الإخطار بإنهاء العقد', { scopeDocIds: scope });
  assert(res.length && res.every(p => scope.has(p.docId)));
});

console.log('\n— Labor calculator (Labor Law arts. 74/76/84) —');
test('termination: half award first 5y, full after', () => {
  const r = Calc.endOfService({ salary: 10000, years: 7, months: 0, mode: 'termination' });
  approx(r.award, 10000 * 0.5 * 5 + 10000 * 2);
});
test('resignation 3y → one third', () => {
  approx(Calc.endOfService({ salary: 9000, years: 3, months: 0, mode: 'resignation' }).award,
    (9000 * 0.5 * 3) / 3);
});
test('resignation 6y → two thirds', () => {
  approx(Calc.endOfService({ salary: 9000, years: 6, months: 0, mode: 'resignation' }).award,
    (9000 * 0.5 * 5 + 9000) * (2 / 3));
});
test('resignation 12y → full award', () => {
  approx(Calc.endOfService({ salary: 9000, years: 12, months: 0, mode: 'resignation' }).award,
    9000 * 0.5 * 5 + 9000 * 7);
});
test('resignation <2y → zero', () => {
  approx(Calc.endOfService({ salary: 9000, years: 1, months: 6, mode: 'resignation' }).award, 0);
});
test('notice: 60d employer/indefinite, 30d otherwise', () => {
  assert(Calc.notice({ mode: 'termination', fixedTerm: false }) === 60);
  assert(Calc.notice({ mode: 'termination', fixedTerm: true }) === 30);
  assert(Calc.notice({ mode: 'resignation', fixedTerm: false }) === 30);
});

console.log('\n— Court costs —');
test('claim fee is 5%', () => {
  const r = Calc.courtCosts({ claimValue: 200000, caseType: 'claim', appeal: false, execution: false });
  approx(r.total, 10000);
});
test('appeal adds 50%', () => {
  const r = Calc.courtCosts({ claimValue: 200000, caseType: 'claim', appeal: true, execution: false });
  approx(r.total, 15000);
});
test('execution fee is 2%', () => {
  const r = Calc.courtCosts({ claimValue: 100000, caseType: 'execution', appeal: false, execution: false });
  approx(r.total, 2000);
});

console.log('\n— Bid evaluation —');
test('margin, score and win probability are bounded', () => {
  const r = Calc.bid({ bidValue: 1200000, estCost: 950000, technical: 85, experience: 70, competitors: 4 });
  approx(r.margin, ((1200000 - 950000) / 950000) * 100, 0.1);
  assert(r.score > 0 && r.score <= 100);
  assert(r.winProbability >= 5 && r.winProbability <= 95);
});

console.log('\n— Converter (text → markdown) —');
const conv = require(path.join(root, 'main', 'convert.js'));
test('article headings detected', () => {
  const md = conv.textToMarkdown('نظام تجريبي\nالمادة (1)\nنص المادة الأول هنا كامل وجملة طويلة تكفي لتكون فقرة وليست عنواناً\n');
  assert(md.includes('### المادة'), md);
});
test('html tables/lists convert', () => {
  const md = conv.htmlToMarkdown('<h1>عنوان</h1><ul><li>بند</li></ul><p>فقرة <strong>مهمة</strong></p>');
  assert(md.includes('# عنوان') && md.includes('- بند') && md.includes('**مهمة**'));
});

console.log('\n— v1.6.16 fast search (precomputed index) —');
test('index entries carry precomputed tokenSet/tokenFreq/titleNorm/titleTokens', () => {
  const e = KB.index[0];
  assert(e.tokenSet && typeof e.tokenSet.has === 'function' && e.tokenSet.size > 0, 'tokenSet precomputed');
  assert(e.tokenFreq && typeof e.tokenFreq.get === 'function' && e.tokenFreq.size > 0, 'tokenFreq precomputed');
  assert(typeof e.titleNorm === 'string' && Array.isArray(e.titleTokens), 'title precomputed');
  assert(e.tokenSet.size <= e.tokens.length, 'set is deduped');
});
test('matchScore with precomputed entry equals slow path', () => {
  const e = KB.index[0];
  const q = KB.tokenize(e.text.slice(0, 40));
  if (!q.length) return;
  const fast = KB.matchScore(q, e.tokens, e);
  const slow = KB.matchScore(q, e.tokens);
  assert(fast.exact === slow.exact && fast.partial === slow.partial && fast.ok === slow.ok, 'same scoring');
});
test('search still ranks exact title match first after optimization', () => {
  const r = KB.search('نظام العمل', 10);
  assert(r.length > 0, 'results exist');
  assert((r[0].doc.title.ar || r[0].doc.title.en || '').includes('نظام العمل'), 'top result is labor law');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
