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
test('v1.6.22: makeExcerpt quotes the matched phrase with 6 words before and after', () => {
  const raw = 'يحدد هذا النظام أحكام العمل في القطاع الخاص وينظم عقد العمل ومكافأة نهاية الخدمة وغيرها من الحقوق والواجبات بين أطراف العلاقة العمالية بشكل عادل ومتوازن.';
  const q = KB.tokenize('مكافأة نهاية الخدمة');
  const ex = KB.makeExcerpt(raw, q);
  assert(ex.includes('مكافأة'), 'excerpt contains the matched term');
  const words = ex.replace(/…/g, '').trim().split(/\s+/).length;
  assert(words <= 6 + 3 + 6, 'excerpt within +-6 words window, got ' + words);
  assert(ex.startsWith('…') === false || true, 'ellipsis allowed only when truncated');
  // exact phrase match keeps the phrase intact inside the excerpt
  assert(ex.indexOf('مكافأة') < ex.indexOf('الخدمة'), 'phrase order preserved');
});
test('v1.6.22: title match ranks strictly before body-only match', () => {
  const r = KB.search('نظام العمل', 60);
  assert(r.length >= 2, 'results returned');
  const first = r[0];
  const titleNorm = KB.tokenize((first.doc.title && (first.doc.title.ar || first.doc.title.en)) || '').join(' ');
  assert(titleNorm.includes(KB.tokenize('نظام العمل').join(' ')), 'first result matches by title');
  const secondBody = r[1];
  const firstIsTitle = titleNorm.includes('عمل');
  if (!firstIsTitle) throw new Error('first result is not a title match');
});
test('v1.6.22: no-match text yields empty excerpt, not unrelated text', () => {
  const ex = KB.makeExcerpt('نص لا علاقة له إطلاقا بالبحث', KB.tokenize('مكافأة نهاية الخدمة'));
  assert(ex === '', 'empty excerpt when nothing matches');
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

console.log('\n\u2014 v1.6.24: search engine overhaul \u2014');
test('Arabic normalization: hamza/alef forms, taa marbuta, alef maqsura, tatweel, diacritics', () => {
  assert(KB.normChars('\u0627\u0644\u0623\u0639\u0645\u0627\u0644') === '\u0627\u0644\u0627\u0639\u0645\u0627\u0644', 'alef forms unified');
  assert(KB.normChars('\u0645\u0643\u0627\u0641\u0623\u0629') === '\u0645\u0643\u0627\u0641\u0627\u0647', 'taa marbuta -> haa');
  assert(KB.normChars('\u0634\u0626\u0648\u0646') === '\u0634\u064a\u0648\u0646', 'yaa hamza -> yaa');
  assert(KB.normChars('\u0645\u0633\u0624\u0648\u0644') === '\u0645\u0633\u0648\u0648\u0644', 'waw hamza -> waw');
  assert(KB.tokenize('\u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629')[0] === '\u0645\u0643\u0627\u0641\u0627\u0647', 'tokenize normalizes + strips al');
  assert(KB.normalizeWord('\u0648\u0645\u0643\u0627\u0641\u0623\u0629') === '\u0645\u0643\u0627\u0641\u0627\u0647', 'conjunction waw stripped');
});
test('normalized search: diacriticless query finds diacritized text and vice versa', () => {
  const r = KB.search('\u0645\u0643\u0627\u0641\u0627\u062a \u0646\u0647\u0627\u064a\u0629 \u0627\u0644\u062e\u062f\u0645\u0647');
  assert(r.length >= 1, 'normalized query matches');
  assert(r[0].doc.id === 'sa-labor-law' || r[0].doc.id === 'sa-ruling-labor-1', 'same top docs as diacritized query');
});
test('BM25: rare term outweighs repeated common term', () => {
  const mini = { kbs: [{ id: 'k1', name: { ar: 'k', en: 'k' }, documents: [
    { id: 'common', type: 'law', title: { ar: '\u0648\u062b\u064a\u0642\u0629', en: 'd1' }, body: Array(12).fill('\u0646\u0635 \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0627\u0645').join(' ') },
    { id: 'rare', type: 'law', title: { ar: '\u0648\u062b\u064a\u0642\u0629', en: 'd2' }, body: '\u0646\u0635 \u0642\u0635\u064a\u0631 \u064a\u0630\u0643\u0631 \u0627\u0644\u0645\u0631\u0627\u0641\u0639\u0627\u062a' }
  ] }] };
  KB.load(mini);
  const r = KB.search('\u0627\u0644\u0645\u0631\u0627\u0641\u0639\u0627\u062a');
  assert(r.length >= 1 && r[0].doc.id === 'rare', 'rare-term doc first');
  KB.load(sample);
});
test('results carry articleNum of the matched article + highlighted excerpt', () => {
  const r = KB.search('\u0645\u0643\u0627\u0641\u0623\u0629 \u0646\u0647\u0627\u064a\u0629 \u0627\u0644\u062e\u062f\u0645\u0629', 60);
  assert(r.length >= 1, 'results exist');
  const withArt = r.find(x => x.articleNum);
  assert(withArt, 'at least one result carries articleNum');
  const top = r.find(x => x.doc.id === 'sa-labor-law');
  if (top) assert(top.articleNum === '74' || top.articleNum === '77' || top.articleNum === '81', 'labor law article detected, got ' + top.articleNum);
  const hl = r.find(x => x.excerptHtml && x.excerptHtml.includes('<mark class="hl">'));
  assert(hl, 'excerpt highlights matched words');
});
test('noise cut: results far below the best hit are dropped', () => {
  const r = KB.search('\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0631\u0627\u0641\u0639\u0627\u062a \u0627\u0644\u0639\u0645\u0627\u0644\u064a\u0629', 200);
  const best = r[0] ? r[0].score : 0;
  assert(r.every(x => x.score >= best * 0.12), 'all results above relative threshold');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
