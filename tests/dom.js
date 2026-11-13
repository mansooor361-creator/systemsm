'use strict';

/* Full renderer smoke test: boots the real UI in jsdom with a stubbed
 * Electron bridge, then exercises the redesigned reader, agents, chat,
 * tools, notes, drawer and settings. */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');

let updateCb = null;
const stubBridge = {
  settingsGet: async () => ({ language: 'ar', theme: 'dark', updateUrl: '', llm: {}, showButtons: { agents: false, chat: false, graph: false, tools: false, notes: false } }),
  settingsSet: async (patch) => patch,
  pickFile: async () => null,
  convertToMarkdown: async () => ({ ok: true, markdown: '# t' }),
  convertFolder: async () => ({ ok: true, converted: 3, failed: [], uploaded: 0 }),
  importFolder: async () => ({ ok: true, count: 2, kb: { id: 'kb-local-test', name: { ar: 'محلي', en: 'Local' }, icon: '📁', documents: [] } }),
  notesSave: async () => ({ ok: true }),
  notesLoad: async () => [{ id: 'n1', markdown: '# ملاحظة تجريبية\n\nنص', modified: Date.now() }],
  notesDelete: async () => ({ ok: true }),
  kbSaveDownloaded: async () => ({ ok: true }),
  kbLoadDownloaded: async () => [],
  kbCheckUpdates: async () => ({ ok: true, updates: [] }),
  kbFetchRemote: async () => ({ ok: false }),
  netPost: async () => ({ answer: 'x' }),
  appVersion: async () => '1.2.0',
  openExternal: () => {},
  onUpdateAvailable: (cb) => { updateCb = cb; }
};

let dom;
let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.error('  ✗', name, '\n   ', e.message); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

function bootDom() {
  return new Promise((resolve, reject) => {
    const d = new JSDOM(html, {
      url: 'file://' + path.join(root, 'renderer', 'index.html'),
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.daaix = stubBridge;
        const store = {};
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          value: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
          }
        });
        window._localStorage = store;
        window.fetch = (url) => {
          const file = path.join(root, 'renderer', String(url).replace(/^.*renderer\//, '').replace(/^\//, ''));
          const text = fs.readFileSync(file, 'utf8');
          return Promise.resolve({ ok: true, json: async () => JSON.parse(text), text: async () => text });
        };
      }
    });
    d.window.addEventListener('error', (e) => reject(new Error('page error: ' + e.message)));
    setTimeout(() => resolve(d), 1200);
  });
}

(async () => {
  dom = await bootDom();
  const { window } = dom;
  const doc = window.document;
  const App = window.eval('App');
  const Chat = window.eval('Chat');
  const Tools = window.eval('Tools');
  const Agents = window.eval('Agents');
  const Notes = window.eval('Notes');

  console.log('\n— Boot (redesigned) —');
  test('boots; sidebar shows category tabs and flat doc list (no folders)', () => {
    assert(doc.querySelectorAll('.cat-tab').length === 6);
    assert(doc.querySelectorAll('#docList .doc-item').length === 9);
    assert(doc.querySelectorAll('.kb-block').length === 0, 'folders removed');
  });
  test('topbar action buttons hidden by default; drawer gear visible', () => {
    ['btnAgents', 'btnChat', 'btnGraph', 'btnTools', 'btnNotes'].forEach(id =>
      assert(doc.getElementById(id).classList.contains('hidden'), id + ' hidden'));
    assert(!doc.getElementById('btnDrawer').classList.contains('hidden'));
  });
  test('home: quick cards + updates feed rendered, big hero', () => {
    assert(doc.querySelectorAll('.quick-card').length === 5);
    assert(doc.querySelectorAll('.feed-item').length >= 5);
    assert(doc.querySelector('.hero h1').textContent.length > 3);
  });

  console.log('\n— Document reader (3 panes) —');
  test('opens نظام العمل: TOC + white paper + properties panel', () => {
    App.openDocument('sa-labor-law');
    assert(doc.querySelector('#docHeader h1').textContent.includes('نظام العمل'));
    assert(doc.querySelectorAll('#docBody .article-card').length >= 3);
    assert(doc.querySelectorAll('#tocItems .toc-item').length >= 3, 'TOC built');
  });
  test('properties: issuing tool, dates, number, extended legislative status', () => {
    const props = doc.getElementById('docProps').textContent;
    assert(props.includes('مرسوم ملكي'), 'issuing tool');
    assert(props.includes('1426/08/02هـ'), 'tool date');
    assert(props.includes('م/51'), 'tool number');
    assert(props.includes('ساري ومعدل'), 'extended status');
  });
  test('version register shows from → to ranges', () => {
    const vb = doc.getElementById('docProps').textContent;
    assert(vb.includes('من → إلى'));
    assert(vb.includes('→ ∞'), 'latest version open-ended');
  });
  test('relations + related rulings + official sources in right column', () => {
    const props = doc.getElementById('docProps').textContent;
    assert(props.includes('الارتباطات'));
    assert(props.includes('المصادر الرسمية'));
    App.openDocument('sa-labor-law');
    assert(doc.getElementById('docProps').textContent.includes('الأحكام المرتبطة'));
  });
  test('edit mode: fab toggles editing + persistent warning banner + local save', () => {
    const fab = doc.getElementById('btnEditDoc');
    fab.click();
    assert(doc.getElementById('docBody').contentEditable === 'true');
    assert(!doc.getElementById('editBanner').classList.contains('hidden'));
    assert(doc.getElementById('editWarningText').textContent.includes('تحذير'));
    doc.getElementById('btnSaveEdits').click();
    assert(window._localStorage['daaix-edit-sa-labor-law'], 'overlay saved');
    assert(doc.getElementById('docBody').querySelector('.edited-badge'), 'edited badge shown');
    doc.getElementById('btnDiscardEdits').click();
    assert(!window._localStorage['daaix-edit-sa-labor-law'], 'discard removes overlay');
  });

  console.log('\n— Chat (plain style) —');
  test('plain Q/A without bubbles; refusal as warning callout', async () => {
    doc.getElementById('chatInput').value = 'ما أحكام مكافأة نهاية الخدمة عند الاستقالة؟';
    await Chat.send();
    assert(doc.querySelector('.chat-q'), 'plain question element');
    assert(doc.querySelector('.chat-a .doc-body'), 'plain answer element');
    assert(!doc.querySelector('.msg.user'), 'no bubble for question');
    doc.getElementById('chatInput').value = 'ما سعر البيتكوين اليوم؟';
    await Chat.send();
    const answers = [...doc.querySelectorAll('.chat-a')];
    assert(answers[answers.length - 1].querySelector('.callout.co-warning'), 'refusal rendered as warning callout');
  });

  console.log('\n— Markdown callouts —');
  test('Obsidian-style callouts render with colors', () => {
    const el = window.eval('renderMarkdown')('> [!WARNING]\n> نص تحذيري\n\n> [!TIP]\n> نصيحة\n');
    assert(el.querySelector('.callout.co-warning'));
    assert(el.querySelector('.callout.co-tip'));
  });

  console.log('\n— Agents —');
  test('agents view runs consultant and saves output', async () => {
    Agents.open('consultant');
    assert(doc.querySelectorAll('#agentsMenu .tool-chip').length === 6);
    doc.querySelector('[data-field=question]').value = 'ما أحكام مكافأة نهاية الخدمة عند الفصل؟';
    await Agents.run();
    const md = doc.querySelector('#agentOutput .agent-result').textContent;
    assert(md.includes('الخلاصة القانونية'));
  });

  console.log('\n— Tools —');
  test('bulk folder conversion reports results', async () => {
    Tools.open('converter');
    doc.getElementById('cvFolder').click();
    await new Promise(r => setTimeout(r, 100));
    assert(doc.getElementById('cvOut').textContent.includes('3'));
  });
  test('labor calculator renders result card', () => {
    Tools.open('labor');
    doc.getElementById('lbGo').click();
    assert(doc.getElementById('lbOut').textContent.includes('مكافأة نهاية الخدمة'));
  });

  console.log('\n— Notes & drawer —');
  test('notes load and editor opens', async () => {
    await Notes.refresh();
    assert(doc.querySelectorAll('.note-card').length === 1);
  });
  test('drawer opens with account + button toggles; toggling shows buttons', async () => {
    App.openDrawer();
    assert(!doc.getElementById('drawer').classList.contains('hidden'));
    assert(doc.getElementById('accountArea').querySelectorAll('button').length === 2, 'login + register');
    const toggles = [...doc.querySelectorAll('#buttonToggles input[type=checkbox]')];
    assert(toggles.length === 5);
    toggles[1].click();
    await new Promise(r => setTimeout(r, 50));
    assert(!doc.getElementById('btnChat').classList.contains('hidden'), 'chat button shown after toggle');
  });

  console.log('\n— Language toggle —');
  test('switching to English flips UI to LTR', async () => {
    await App.setLang('en');
    assert(doc.documentElement.dir === 'ltr');
    App.openDocument('sa-labor-law');
    assert(doc.querySelector('#docHeader h1').textContent.includes('Labor Law'));
    assert(doc.getElementById('docProps').textContent.includes('In Force (Amended)'));
    await App.setLang('ar');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message) || e); process.exit(1); });
