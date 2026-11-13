'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
let passed = 0, failed = 0;

const test = (name, fn) => {
  try { fn(); passed++; console.log('  \u2713', name); }
  catch (e) { failed++; console.error('  \u2717', name, '\n   ', e.message); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

const ctx = {
  console,
  window: {},
  document: { querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {} }) },
  navigator: {},
  fetch: async () => { throw new Error('offline'); },
  setTimeout, clearTimeout
};
vm.createContext(ctx);

const EXPORTS = {
  'i18n.js': 'globalThis.I18n=I18n;',
  'kb.js': 'globalThis.KB=KB;',
  'retrieval.js': 'globalThis.Retrieval=Retrieval;',
  'calculators.js': 'globalThis.Calc=Calc;',
  'agents.js': 'globalThis.Agents=Agents;globalThis.AGENTS=AGENTS;'
};
['i18n.js', 'kb.js', 'retrieval.js', 'calculators.js', 'agents.js'].forEach(f => {
  vm.runInContext(
    fs.readFileSync(path.join(root, 'renderer', 'js', f), 'utf8') + '\n;' + EXPORTS[f],
    ctx, { filename: f });
});

vm.runInContext(`
  globalThis.App = { toast(){}, showView(){}, currentDocId: null };
  globalThis.renderMarkdown = (md) => ({ md });
  globalThis.Notes = { refresh: async () => {} };
`, ctx);

const { I18n, KB, Retrieval, Agents, AGENTS } = ctx;
KB.load(JSON.parse(fs.readFileSync(path.join(root, 'renderer', 'data', 'kb-sample.json'), 'utf8')));
Retrieval.build();

console.log('\n\u2014 Agents catalog (simple mode) \u2014');
test('6 agents defined with icon + bilingual label + description', () => {
  assert(AGENTS.length === 6);
  const ids = AGENTS.map(a => a.id);
  ['consultant', 'memo', 'strategy', 'contracts', 'research', 'governance'].forEach(id => assert(ids.includes(id), id));
  AGENTS.forEach(a => {
    assert(a.icon, a.id + ' icon');
    assert(a.label.ar && a.label.en, a.id + ' label');
    assert(a.desc.ar && a.desc.en, a.id + ' desc');
  });
});

console.log('\n\u2014 Simple grounded answer (no section skeleton) \u2014');
test('answer is plain + citations + disclaimer, no empty-section placeholders', () => {
  const agent = Agents.get('consultant');
  const kbRes = Retrieval.extractiveAnswer('\u0645\u0627 \u0623\u062d\u0643\u0627\u0645 \u0645\u0643\u0627\u0641\u0623\u0629 \u0646\u0647\u0627\u064a\u0629 \u0627\u0644\u062e\u062f\u0645\u0629 \u0639\u0646\u062f \u0627\u0644\u0641\u0635\u0644\u061f', { topK: 10 });
  assert(kbRes.passages.length > 0);
  const result = Agents.extractiveRun(agent, { message: '\u0645\u0643\u0627\u0641\u0623\u0629 \u0646\u0647\u0627\u064a\u0629 \u0627\u0644\u062e\u062f\u0645\u0629' }, kbRes, []);
  const md = result.markdown;
  assert(!md.includes('\u0644\u0627 \u062a\u0648\u062c\u062f \u0646\u0635\u0648\u0635 \u0645\u0648\u062b\u0642\u0629 \u0641\u064a \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645 \u0628\u0639\u062f'), 'no section placeholders');
  assert(md.includes('\u0627\u0644\u0645\u0627\u062f\u0629') || md.includes('\u0646\u0638\u0627\u0645'), 'KB passages embedded verbatim');
  assert(md.includes('\u0631\u0627\u062c\u0639\u0647\u0627') || md.includes('review'), 'disclaimer present');
  assert(/\[\d+\]/.test(md), 'numbered citations');
});
test('empty KB gives one refusal line (warning callout), nothing invented', () => {
  const agent = Agents.get('contracts');
  const kbRes = { passages: [], citations: [], answer: I18n.t('chatNoAnswer') };
  const result = Agents.extractiveRun(agent, {}, kbRes, []);
  assert(result.markdown.includes(I18n.t('chatNoAnswer')));
  assert(result.markdown.includes('[!WARNING]'), 'refusal rendered as warning callout');
  assert(!result.markdown.includes('##'), 'no section skeleton on refusal');
});
test('external connector results are labeled as external', () => {
  const agent = Agents.get('consultant');
  const kbRes = Retrieval.extractiveAnswer('\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644', { topK: 5 });
  const result = Agents.extractiveRun(agent, { question: 'test' }, kbRes,
    [{ name: 'smartk-ai API', answer: 'external answer text' }]);
  assert(result.markdown.includes('\u0645\u0635\u0627\u062f\u0631 \u062e\u0627\u0631\u062c\u064a\u0629'));
  assert(result.markdown.includes('smartk-ai API'));
});
test('LLM prompt is strict and template-free; refusal sentence provided', () => {
  const src = fs.readFileSync(path.join(root, 'renderer', 'js', 'agents.js'), 'utf8');
  assert(!src.includes('OUTPUT SECTIONS'), 'no rigid section template');
  assert(src.includes('REFUSAL SENTENCE'), 'refusal sentence injected');
  assert(src.includes('no rigid section templates'), 'concise-answer instruction');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
