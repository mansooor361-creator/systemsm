'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
let passed = 0, failed = 0;

const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.error('  ✗', name, '\n   ', e.message); }
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

console.log('\n— Agents catalog —');
test('6 specialized agents defined', () => {
  assert(AGENTS.length === 6);
  const ids = AGENTS.map(a => a.id);
  ['consultant', 'memo', 'strategy', 'contracts', 'research', 'governance'].forEach(id => assert(ids.includes(id), id));
});
test('every agent has fields, sections and bilingual labels', () => {
  AGENTS.forEach(a => {
    assert(a.fields.length >= 1, a.id + ' fields');
    assert(a.sections.length >= 3, a.id + ' sections');
    assert(a.label.ar && a.label.en && a.desc.ar && a.desc.en, a.id + ' labels');
  });
});

console.log('\n— Extractive agent run (grounded) —');
test('memo agent output has all sections + citations + disclaimer', () => {
  const agent = Agents.get('memo');
  const kbRes = Retrieval.extractiveAnswer('مذكرة دعوى عمالية مطالبة بمكافأة نهاية الخدمة', { topK: 10 });
  assert(kbRes.passages.length > 0);
  const result = Agents.extractiveRun(agent, { caseType: 'مذكرة دعوى', facts: 'فصل العامل', claims: 'المكافأة' }, kbRes, []);
  const md = result.markdown;
  agent.sections.forEach(s => assert(md.includes(s.title.ar), s.title.ar));
  assert(md.includes('المادة') || md.includes('نظام'), 'KB passages embedded');
  assert(md.includes('راجعها') || md.includes('review'), 'disclaimer present');
  assert(/\[\d+\]/.test(md), 'numbered citations');
});
test('empty KB section states explicitly instead of inventing', () => {
  const agent = Agents.get('contracts');
  const kbRes = { passages: [], citations: [] };
  const result = Agents.extractiveRun(agent, {}, kbRes, []);
  assert(result.markdown.includes('لا توجد نصوص موثقة'));
});
test('external connector results are labeled as external', () => {
  const agent = Agents.get('consultant');
  const kbRes = Retrieval.extractiveAnswer('نظام العمل', { topK: 5 });
  const result = Agents.extractiveRun(agent, { question: 'test' }, kbRes,
    [{ name: 'smartk-ai API', answer: 'external answer text' }]);
  assert(result.markdown.includes('مصادر خارجية'));
  assert(result.markdown.includes('smartk-ai API'));
});
test('section-to-passage routing prefers article-like passages for legal grounds', () => {
  const kbRes = Retrieval.extractiveAnswer('مكافأة نهاية الخدمة الفصل التعسفي', { topK: 8 });
  const grounds = Agents.passagesForSection('grounds', kbRes.passages);
  assert(grounds.length > 0);
  assert(grounds.some(p => p.kind === 'article'), 'article passages prioritized');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
