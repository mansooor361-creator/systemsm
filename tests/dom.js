'use strict';

/* Full renderer smoke test: boots the real UI in jsdom with a stubbed
 * Electron bridge, then exercises tree, reader, chat, tools and notes. */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');

const sample = JSON.parse(fs.readFileSync(path.join(root, 'renderer', 'data', 'kb-sample.json'), 'utf8'));

let updateCb = null;
const stubBridge = {
  settingsGet: async () => ({ language: 'ar', theme: 'dark', updateUrl: '', llm: {} }),
  settingsSet: async (patch) => patch,
  pickFile: async () => null,
  convertToMarkdown: async () => ({ ok: true, markdown: '# t' }),
  notesSave: async () => ({ ok: true }),
  notesLoad: async () => [{ id: 'n1', markdown: '# ملاحظة تجريبية\n\nنص', modified: Date.now() }],
  notesDelete: async () => ({ ok: true }),
  kbSaveDownloaded: async () => ({ ok: true }),
  kbLoadDownloaded: async () => [],
  kbCheckUpdates: async () => ({ ok: true, updates: [] }),
  kbFetchRemote: async () => ({ ok: false }),
  appVersion: async () => '1.0.0',
  openExternal: () => {},
  onUpdateAvailable: (cb) => { updateCb = cb; }
};

let dom;
let passed = 0, failed = 0;

function bootDom() {
  return new Promise((resolve, reject) => {
    const d = new JSDOM(html, {
      url: 'file://' + path.join(root, 'renderer', 'index.html'),
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.daaix = stubBridge;
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
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.error('  ✗', name, '\n   ', e.message); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

(async () => {
  dom = await bootDom();
  const { window } = dom;
  const doc = window.document;
  const App = window.eval('App');
  const Chat = window.eval('Chat');
  const Tools = window.eval('Tools');
  const Notes = window.eval('Notes');

  console.log('\n— Boot —');
  test('app boots, KB index built (9 docs)', () => {
    assert(window.eval('KB.index.length') === 9);
  });
  test('tree renders 2 KB blocks', () => {
    assert(doc.querySelectorAll('.kb-block').length === 2);
  });
  test('home stats rendered', () => {
    assert(doc.querySelectorAll('.stat-card').length === 3);
  });
  test('i18n applied (RTL Arabic)', () => {
    assert(doc.documentElement.dir === 'rtl');
    assert(doc.getElementById('btnLang').textContent === 'EN');
  });

  console.log('\n— Document reader —');
  test('opens نظام العمل with articles and version history', () => {
    App.openDocument('sa-labor-law');
    assert(doc.querySelector('#docHeader h1').textContent.includes('نظام العمل'));
    assert(doc.querySelectorAll('#docBody .article-card').length >= 3);
    assert(doc.querySelectorAll('#docSide .ver-item').length === 4, '4 versions expected');
    assert(doc.querySelectorAll('#docSide .rel-item').length >= 4, 'relations + backlinks expected');
  });
  test('opens حكم عمالي with ruling-specific rendering', () => {
    App.openDocument('sa-ruling-labor-1');
    assert(doc.querySelector('#docHeader .chip').textContent.includes('حكم'));
    assert(doc.querySelectorAll('#docBody .article-card').length === 2);
  });
  test('navigating relation opens target document', () => {
    App.openDocument('sa-ruling-labor-1');
    const rel = [...doc.querySelectorAll('#docSide .rel-item')].find(r => r.textContent.includes('نظام العمل'));
    assert(rel, 'relation item exists');
    rel.click();
    assert(App.currentDocId === 'sa-labor-law');
  });

  console.log('\n— Search —');
  test('global search lists results and opens doc', () => {
    const input = doc.getElementById('globalSearch');
    input.value = 'المحتوى المحلي';
    App.search('المحتوى المحلي');
    const items = doc.querySelectorAll('.sr-item');
    assert(items.length >= 1);
    items[0].click();
    assert(App.currentDocId === 'sa-agreement-icv');
  });

  console.log('\n— Chat (grounded) —');
  test('chat answers from KB with citations and refuses otherwise', async () => {
    const log = doc.getElementById('chatLog');
    doc.getElementById('chatInput').value = 'ما أحكام مكافأة نهاية الخدمة عند الاستقالة؟';
    await Chat.send();
    const bots = [...log.querySelectorAll('.msg.bot')];
    assert(bots.length === 1);
    assert(bots[0].textContent.includes('المادة') || bots[0].textContent.includes('['), 'grounded answer');
    assert(bots[0].querySelectorAll('.cite').length > 0, 'citation links');
    doc.getElementById('chatInput').value = 'ما سعر البيتكوين اليوم؟';
    await Chat.send();
    const bots2 = [...log.querySelectorAll('.msg.bot')];
    assert(bots2[bots2.length - 1].textContent.includes('لن أخمّن'), 'refusal for off-KB question');
  });

  console.log('\n— Tools —');
  test('labor calculator renders result card', () => {
    Tools.open('labor');
    doc.getElementById('lbGo').click();
    const out = doc.getElementById('lbOut').textContent;
    assert(out.includes('مكافأة نهاية الخدمة') && out.includes('60'), out);
  });
  test('court costs renders 5% claim fee', () => {
    Tools.open('costs');
    doc.getElementById('ccGo').click();
    assert(doc.getElementById('ccOut').textContent.includes('5,000'));
  });
  test('building checklist computes compliance', () => {
    Tools.open('building');
    const box = doc.querySelector('#blStages input[type=checkbox]');
    box.click();
    assert(doc.getElementById('blPct').textContent.includes('6%') || doc.getElementById('blPct').textContent.includes('6'), doc.getElementById('blPct').textContent);
  });

  console.log('\n— Notes —');
  test('notes load and editor opens', async () => {
    await Notes.refresh();
    assert(doc.querySelectorAll('.note-card').length === 1);
    Notes.edit('n1');
    assert(!doc.getElementById('noteEditor').classList.contains('hidden'));
    assert(doc.getElementById('noteText').value.includes('ملاحظة تجريبية'));
  });

  console.log('\n— Language toggle —');
  test('switching to English flips UI to LTR', async () => {
    await App.toggleLang();
    assert(doc.documentElement.dir === 'ltr');
    assert(doc.getElementById('btnLang').textContent === 'ع');
    App.openDocument('sa-labor-law');
    assert(doc.querySelector('#docHeader h1').textContent.includes('Labor Law'));
    await App.toggleLang();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
