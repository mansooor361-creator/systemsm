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
  assert(!/\[\d+\]/.test(md), 'no numbered citation blocks \u2014 sources are document titles at top');
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

console.log('\n\u2014 Agent Skills (SKILL.md spec) \u2014');
test('skillToMarkdown/skillFromMarkdown round-trip (frontmatter name + description + body)', () => {
  const sk = { name: 'CaseEvaluation', description: 'Evaluate case documents against a KB', instructions: 'Analyze the case, cite articles, list risks.' };
  const md = Agents.skillToMarkdown(sk);
  assert(md.startsWith('---\nname: CaseEvaluation\ndescription: Evaluate case documents against a KB\n---\n'), md);
  const back = Agents.skillFromMarkdown(md);
  assert(back.name === 'CaseEvaluation', back.name);
  assert(back.description === sk.description);
  assert(back.instructions === sk.instructions);
});
test('skillFromMarkdown tolerates CRLF and files without frontmatter', () => {
  const withCrlf = Agents.skillFromMarkdown('---\r\nname: Demo\r\ndescription: D\r\n---\r\nBody line one.\r\nBody two.');
  assert(withCrlf.name === 'Demo' && withCrlf.description === 'D' && withCrlf.instructions.includes('Body two.'));
  const plain = Agents.skillFromMarkdown('# Just instructions\nDo X');
  assert(plain.name === '' && plain.instructions.includes('Do X'));
});
test('builtin skills are exactly the 3 prompt-based skills (x-search, memo, writing)', () => {
  const ids = Agents.skills().map(sk => sk.id);
  assert(ids.length === 3, 'exactly 3 builtin skills, got: ' + ids.join(','));
  ['x-search', 'memo', 'writing'].forEach(id => assert(ids.includes(id), id + ' present'));
  assert(!ids.includes('doc-analysis') && !ids.includes('governance'), 'old builtin skills removed');
  const xs = Agents.skills().find(sk => sk.id === 'x-search');
  assert(xs.icon === '\u2315', 'monochrome lens glyph');
  assert(xs.label.en === 'Search on X' && xs.label.ar.includes('X'), 'bilingual labels');
});

test('allSkills merges builtin skills with custom skills from settings', () => {
  ctx.App.settings = { customSkills: [{ id: 'skill-1', name: 'CaseEvaluation', agent: 'research', model: 'gpt-4o-mini', description: 'Eval case docs', instructions: 'Do the study.' }] };
  const all = Agents.allSkills();
  assert(all.some(sk => sk.id === 'skill-1' && sk.name === 'CaseEvaluation' && sk.model === 'gpt-4o-mini'), 'custom skill present');
  assert(all.some(sk => sk.id && sk.instructions), 'builtin skills still present');
  assert(Agents.skillById('skill-1').agent === 'research');
});

test('v1.6.22: systemInstructions = rules + mode + project instructions + memory', () => {
  Agents.mode = 'legal';
  Agents.project = 'CaseX';
  ctx.App.settings = { assistantProjects: [{ id: 'p1', name: 'CaseX', description: '', instructions: 'Always cite Saudi labor law.', context: [] }], assistantMemory: { recent: true, saved: true, maxRecent: 30, recentList: [{ title: 'T', summary: 'S' }], savedList: [{ text: 'M1' }] } };
  const si = Agents.systemInstructions();
  assert(si.includes('مساعد معرفي') || si.includes('knowledge assistant'), 'base rules present');
  assert(si.includes('الوقائع') || si.includes('facts'), 'legal mode instructions present');
  assert(si.includes('CaseX') && si.includes('Always cite Saudi labor law.'), 'project instructions present');
  assert(si.includes('T') && si.includes('M1'), 'memory present');
  Agents.mode = 'auto';
  Agents.project = null;
  ctx.App.settings = {};
});
test('v1.6.22: assistantMemory defaults and saveMemoryPoint dedupes', async () => {
  ctx.App.settings = {};
  ctx.window.daaix = { settingsSet: async () => {} };
  const mem = Agents.assistantMemory();
  assert(mem.recent === true && mem.saved === true && mem.maxRecent === 30, 'defaults');
  const ok1 = await Agents.saveMemoryPoint('نقطة مهمة');
  const ok2 = await Agents.saveMemoryPoint('نقطة مهمة');
  assert(ok1 === true && ok2 === false, 'dedupe');
  assert(Agents.assistantMemory().savedList.some(r => r.text === 'نقطة مهمة'), 'point stored');
  ctx.window.daaix = undefined;
  ctx.App.settings = {};
});
test('v1.6.22: saveProject writes settings + project.md content', async () => {
  let saved = null;
  ctx.window.daaix = { settingsSet: async (patch) => { saved = patch; }, projectsSave: async (name, md, ag) => { ctx.__projMd = md; ctx.__agentsMd = ag; return { ok: true }; } };
  const p = await Agents.saveProject('ProjA', 'desc', 'do X');
  assert(p.name === 'ProjA' && p.instructions === 'do X', 'project saved');
  assert(saved && saved.assistantProjects.some(x => x.name === 'ProjA'), 'settings persisted');
  assert(ctx.__projMd.includes('# ProjA') && ctx.__projMd.includes('السياق'), 'project.md structure');
  assert(ctx.__agentsMd === 'do X', 'AGENTS.md content');
  ctx.window.daaix = undefined;
  ctx.App.settings = {};
});

console.log('\n\u2014 v1.6.25: memory switches \u2014');
test('saveMemoryPoint returns false when saved-memories switch is off', async () => {
  ctx.App.settings.assistantMemory = { recent: true, saved: false, maxRecent: 30, recentList: [], savedList: [] };
  const ok = await ctx.Agents.saveMemoryPoint('\u0646\u0642\u0637\u0629 \u0644\u0644\u062a\u062c\u0631\u0628\u0629');
  assert(ok === false, 'refuses when disabled');
});
test('rememberSession respects maxRecent bounds (10-50)', () => {
  ctx.App.settings.assistantMemory = { recent: true, saved: true, maxRecent: 12, recentList: [], savedList: [] };
  for (let i = 0; i < 20; i++) ctx.Agents.rememberSession('\u0633\u0624\u0627\u0644 \u0631\u0642\u0645 ' + i + ' \u0639\u0646 \u0627\u0644\u0646\u0638\u0627\u0645', '\u062c\u0648\u0627\u0628 \u0645\u062e\u062a\u0635\u0631.');
  const mem = ctx.Agents.assistantMemory();
  assert(mem.recentList.length <= 12, 'capped at maxRecent');
  ctx.App.settings.assistantMemory = { recent: true, saved: true, maxRecent: 30, recentList: [], savedList: [] };
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
