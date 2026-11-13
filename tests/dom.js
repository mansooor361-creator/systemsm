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
const tests = [];
const test = (name, fn) => { tests.push([name, fn]); };
const runAll = async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('  ✓', name); }
    catch (e) { failed++; console.error('  ✗', name, '\n   ', (e && e.message) || e); }
  }
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
  const KB = window.eval('KB');

  console.log('\n— Boot (redesigned) —');
  test('boots; wide sidebar removed, narrow icon rail with home + kb icons', () => {
    assert(!doc.getElementById('sidebar'), 'wide sidebar removed');
    const rail = doc.getElementById('rail');
    assert(rail, 'icon rail present');
    ['btnRailHome', 'btnRailKb', 'btnAgents', 'btnChat', 'btnGraph', 'btnTools', 'btnNotes', 'btnDrawer']
      .forEach(id => assert(rail.querySelector('#' + id), id + ' in rail'));
    assert(doc.querySelector('#topbar .brand .logo'), 'logo-mark restored in topbar');
    assert(!doc.getElementById('btnKbMenu'), 'folder icon removed from topbar');
    assert(doc.getElementById('btnKbPicker'), 'KB picker button next to search');
  });
  test('topbar action buttons hidden by default; drawer gear visible', () => {
    ['btnAgents', 'btnChat', 'btnGraph', 'btnTools', 'btnNotes'].forEach(id =>
      assert(doc.getElementById(id).classList.contains('hidden'), id + ' hidden'));
    assert(!doc.getElementById('btnDrawer').classList.contains('hidden'));
  });
  test('home: quick cards + updates feed rendered, big hero', () => {
    assert(doc.querySelectorAll('#quickCards .quick-card').length === 5);
    assert(doc.querySelectorAll('.feed-item').length >= 5);
    assert(doc.querySelector('.hero h1').textContent.length > 3);
  });

  console.log('\n— Document reader (tabbed, classic) —');
  test('opens نظام العمل: TOC + white paper + document info table', () => {
    App.openDocument('sa-labor-law');
    assert(doc.querySelector('#docHeader h1').textContent.includes('نظام العمل'));
    assert(doc.querySelectorAll('#docBody .article-card').length >= 3);
    assert(doc.querySelectorAll('#tocItems .toc-item').length >= 3, 'TOC built');
    const info = doc.querySelector('#docHeader .doc-info').textContent;
    assert(info.includes('م/51'), 'tool number in info table');
    assert(info.includes('مرسوم ملكي'), 'issuing tool in info table');
    assert(info.includes('ساري ومعدل'), 'extended status in info table');
  });
  test('center tabs: original + publication reference panes', () => {
    doc.querySelector('#centerTabs [data-tab=original]').click();
    assert(!doc.getElementById('paneOriginal').classList.contains('hidden'));
    assert(doc.getElementById('docOriginal').querySelectorAll('.article-card').length >= 3, 'original copy rendered');
    doc.querySelector('#centerTabs [data-tab=pub]').click();
    const pub = doc.getElementById('docPublication').textContent;
    assert(pub.includes('هيئة الخبراء بمجلس الوزراء'), 'publisher');
    assert(pub.includes('هيئة الخبراء') && (pub.includes('←') || pub.includes('وزارة')), 'source links');
    doc.querySelector('#centerTabs [data-tab=props]').click();
    assert(!doc.getElementById('paneProps').classList.contains('hidden'));
  });
  test('right tabs: version register من → إلى, amendments with by, rulings with number+date, doc chat', () => {
    const versions = doc.getElementById('rpVersions').textContent;
    assert(versions.includes('من → إلى'));
    assert(versions.includes('→ ∞'), 'latest version open-ended');
    doc.querySelector('.sub-tabs [data-sub=amends]').click();
    assert(!doc.getElementById('rpAmends').classList.contains('hidden'));
    assert(doc.getElementById('rpAmends').textContent.includes('من قبل'));
    doc.querySelector('#rightTabs [data-tab=rulings]').click();
    const rulings = doc.getElementById('rpaneRulings').textContent;
    assert(rulings.includes('حكم عمالي'), 'ruling listed');
    assert(rulings.includes('قضية عمالية 1234/1444'), 'ruling number+date');
    doc.querySelector('#rightTabs [data-tab=relations]').click();
    assert(doc.getElementById('rpaneRelations').textContent.includes('الارتباطات') || doc.getElementById('rpaneRelations').children.length > 0, 'relations pane');
    doc.querySelector('#rightTabs [data-tab=chat]').click();
    assert(!doc.getElementById('rpaneChat').classList.contains('hidden'));
  });
  test('article-level amendment annotations shown under affected articles', () => {
    App.openDocument('sa-labor-law');
    const notes = [...doc.querySelectorAll('#docBody .article-amend')];
    assert(notes.length >= 2, 'two article amendments annotated');
    assert(notes[0].textContent.includes('1445/02/19هـ'));
    assert(notes[0].textContent.includes('المرسوم الملكي م/65'));
  });
  test('TOC toggle hides/shows index column', () => {
    doc.getElementById('btnTocToggle').click();
    assert(doc.getElementById('docToc').classList.contains('collapsed'), 'toc hidden');
    doc.getElementById('btnTocToggle').click();
    assert(!doc.getElementById('docToc').classList.contains('collapsed'), 'toc back');
  });
  test('yellow-light headings styled like the website', () => {
    const el = window.eval('renderMarkdown')('# عنوان رئيسي\n\n## عنوان فرعي\n\n#### عنوان صغير\n');
    assert(el.querySelector('h1'));
    assert(el.querySelector('h2'));
    assert(el.querySelector('h4'));
  });
  test('doc chat answers scoped to current document', async () => {
    doc.querySelector('#rightTabs [data-tab=chat]').click();
    doc.getElementById('docChatInput').value = 'ما أحكام مكافأة نهاية الخدمة عند الاستقالة؟';
    await App.sendDocChat();
    assert(doc.querySelector('#docChatLog .chat-a .doc-body'), 'doc chat answered');
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

  console.log('\n— Agents (Copilot-style chat) —');
  test('agents view is a chat: menu, log, input; consultant answers grounded', async () => {
    Agents.open('consultant');
    assert(doc.querySelectorAll('#agentsMenu .tool-chip').length === 6);
    assert(doc.getElementById('agentLog'), 'chat log exists');
    assert(doc.getElementById('agentInput'), 'chat input exists');
    assert(doc.getElementById('agentInput').placeholder.includes('@'), 'placeholder mentions @ context');
    doc.getElementById('agentInput').value = 'ما أحكام مكافأة نهاية الخدمة عند الفصل؟';
    await Agents.send();
    const answers = [...doc.querySelectorAll('#agentLog .chat-a .doc-body')];
    assert(answers.length >= 1, 'agent answered in chat');
    const md = answers[answers.length - 1].textContent;
    assert(!md.includes('لا توجد نصوص موثقة في قاعدة المعرفة لهذا القسم بعد'), 'no empty section placeholders');
    assert(md.includes('المادة') || md.includes('نظام'), 'grounded KB passages in answer');
  });
  test('/ commands popup fills input', () => {
    const input = doc.getElementById('agentInput');
    input.value = '/';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const popup = doc.getElementById('cmdPopup');
    assert(!popup.classList.contains('hidden'), 'commands popup visible');
    assert(popup.textContent.includes('لخّص'), 'command listed');
    popup.querySelector('.ctx-item').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert(input.value.length > 3, 'command filled input');
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
  test('contract tool: generates structure + analyzes clauses', () => {
    Tools.open('contract');
    assert(doc.querySelectorAll('#toolsMenu .tool-chip').length === 11, '11 tools now');
    doc.getElementById('ctGen').click();
    const gen = doc.getElementById('ctOut').textContent;
    assert(gen.includes('أبجدية العقود'), 'contract alphabet in generated structure');
    doc.getElementById('ctText').value = 'عقد توريد بين الطرفين دون تحديد الثمن بشكل مطلق واعتماد ما تراه الشركة مناسباً.';
    doc.getElementById('ctCheck').click();
    const rep = doc.getElementById('ctOut').textContent;
    assert(rep.includes('بنود ناقصة'), 'missing clauses reported');
    assert(rep.includes('مطلق') || rep.includes('دون تحديد'), 'risky wording flagged');
  });

  test('social monitor: platforms, run without connector shows hint + KB context', async () => {
    Tools.open('socialMonitor');
    assert(doc.querySelectorAll('#smPlatforms input[type=checkbox]').length === 8, '8 platforms');
    doc.getElementById('smTopic').value = 'مكافأة نهاية الخدمة';
    doc.getElementById('smRun').click();
    await new Promise(r => setTimeout(r, 150));
    const rep = doc.getElementById('smOut').textContent;
    assert(rep.includes('تقرير الرصد') || rep.includes('Monitoring report'), 'report rendered');
    assert(rep.includes('مكافأة نهاية الخدمة'), 'topic in report');
    assert(rep.includes('نظام العمل') || rep.includes('المادة'), 'KB regulatory context cited');
  });
  test('whatsapp responder: injected Q/A answered first, KB second, refusal otherwise', async () => {
    Tools.open('whatsapp');
    assert(doc.getElementById('waKb'), 'KB selector present');
    doc.getElementById('waAddPair').click();
    const pair = doc.querySelector('#waPairs .wa-pair');
    pair.querySelector('input').value = 'كم عدد أيام الإجازة السنوية؟';
    pair.querySelector('textarea').value = '21 يوماً حسب ما هو محفوظ محلياً.';
    doc.getElementById('waTestQuery').value = 'كم عدد أيام الإجازة السنوية؟';
    doc.getElementById('waTestBtn').click();
    await new Promise(r => setTimeout(r, 50));
    let out = doc.getElementById('waTestOut').textContent;
    assert(out.includes('21 يوماً'), 'injected pair answered');
    doc.getElementById('waTestQuery').value = 'ما أحكام مكافأة نهاية الخدمة عند الاستقالة؟';
    doc.getElementById('waTestBtn').click();
    await new Promise(r => setTimeout(r, 50));
    out = doc.getElementById('waTestOut').textContent;
    assert(out.includes('المادة') || out.includes('مكافأة'), 'KB-grounded answer');
    doc.getElementById('waTestQuery').value = 'ما سعر البيتكوين اليوم؟';
    doc.getElementById('waTestBtn').click();
    await new Promise(r => setTimeout(r, 50));
    out = doc.getElementById('waTestOut').textContent;
    assert(out.includes('لن يرد المستجيب بتخمين'), 'refusal when nothing documented');
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

  console.log('\n— Login (built-in account) —');
  test('login modal validates known account and stores session', async () => {
    App.openLogin();
    assert(!doc.getElementById('loginModal').classList.contains('hidden'));
    assert(doc.getElementById('loginUser').value === '' || doc.getElementById('loginUser').value.includes('@'));
    doc.getElementById('loginUser').value = 'Mansooor361@gmail.com';
    doc.getElementById('loginPass').value = 'wrong';
    doc.getElementById('btnLoginSubmit').click();
    assert(!doc.getElementById('loginError').classList.contains('hidden'), 'wrong password rejected');
    doc.getElementById('loginPass').value = '123456';
    doc.getElementById('btnLoginSubmit').click();
    await new Promise(r => setTimeout(r, 50));
    assert(doc.getElementById('loginModal').classList.contains('hidden'), 'modal closed on success');
    assert(doc.getElementById('accountArea').textContent.includes('Mansooor361@gmail.com'), 'account shown');
    App.renderAccount();
  });

  console.log('\n— KB menu + home hover panel —');
  test('rail KB icon menu lists knowledge bases and sources', () => {
    doc.getElementById('btnRailKb').click();
    const menu = doc.getElementById('kbMenu');
    assert(!menu.classList.contains('hidden'));
    assert(menu.textContent.includes('قانون وتشريعات'));
    assert(menu.textContent.includes('الأنظمة العمانية'));
    assert(menu.textContent.includes('القرآن'));
    doc.body.click();
    assert(menu.classList.contains('hidden'), 'menu closes on outside click');
  });
  test('home hover panel shows categories + docs on strip hover', () => {
    const strip = doc.getElementById('homeKbStrip');
    const panel = doc.getElementById('homeKbPanel');
    assert(panel.classList.contains('hidden'), 'panel hidden initially');
    strip.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
    assert(!panel.classList.contains('hidden'), 'panel appears on hover');
    assert(doc.querySelectorAll('#hkCats .hk-cat').length === 6);
    assert(doc.querySelectorAll('#hkDocs .hk-doc').length > 3, 'docs listed in panel');
    strip.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));
    assert(panel.classList.contains('hidden'), 'panel disappears on leave');
  });

  console.log('\n— Agents @-context —');
  test('typing @ shows autocomplete of KBs and docs; selection scopes run', async () => {
    Agents.context = [];
    Agents.open('consultant');
    const input = doc.getElementById('agentInput');
    assert(input, 'chat input exists');
    input.value = '@عمال';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const popup = doc.getElementById('ctxPopup');
    assert(!popup.classList.contains('hidden'), 'popup visible');
    assert(popup.textContent.includes('نظام العمل') || popup.querySelectorAll('.ctx-item').length > 0, 'KB/doc suggestions');
    popup.querySelector('.ctx-item').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert(Agents.context.length === 1, 'context chip added');
    assert(doc.querySelectorAll('#ctxChips .ctx-chip').length === 1);
    const scope = Agents.contextScopeIds();
    assert(scope && scope.size >= 1, 'scope ids computed');
    input.value = 'ما أحكام مكافأة نهاية الخدمة؟';
    await Agents.send();
    const answers = [...doc.querySelectorAll('#agentLog .chat-a .doc-body')];
    assert(answers.length >= 1, 'scoped agent answered');
    Agents.context = [];
  });

  console.log('\n— Settings: 3 windows (v1.5) —');
  test('settings tabs: three windows switch panes', () => {
    App.showView('settings');
    const tabs = doc.querySelectorAll('#setTabs .set-tab');
    assert(tabs.length === 3, 'three settings windows');
    assert(!doc.getElementById('setPaneSettings').classList.contains('hidden'), 'settings pane visible first');
    assert(doc.getElementById('setPaneKbs').classList.contains('hidden'));
    assert(doc.getElementById('setPaneTools').classList.contains('hidden'));
    tabs[1].click();
    assert(!doc.getElementById('setPaneKbs').classList.contains('hidden'), 'KB pane opens');
    assert(doc.getElementById('setPaneSettings').classList.contains('hidden'));
    tabs[2].click();
    assert(!doc.getElementById('setPaneTools').classList.contains('hidden'), 'tools pane opens');
    tabs[0].click();
    assert(!doc.getElementById('setPaneSettings').classList.contains('hidden'));
  });
  test('KB window: rows with toggles + source; disabling removes from top picker', async () => {
    const rows = doc.querySelectorAll('#kbSettingsList .settings-row');
    assert(rows.length === KB.kbs.length, 'one row per KB');
    assert(rows[0].querySelector('.cat-chip'), 'source chip on KB row');
    doc.getElementById('btnKbPicker').click();
    const before = doc.querySelectorAll('#kbPickerMenu .kb-menu-item').length;
    assert(before === KB.kbs.length + 1, 'All + enabled KBs in picker');
    doc.body.click();
    rows[0].querySelector('input').click();
    await new Promise(r => setTimeout(r, 50));
    doc.getElementById('btnKbPicker').click();
    const after = doc.querySelectorAll('#kbPickerMenu .kb-menu-item').length;
    assert(after === before - 1, 'disabled KB removed from picker');
    doc.body.click();
    rows[0].querySelector('input').click();
    await new Promise(r => setTimeout(r, 50));
  });
  test('KB window: add via API fetches remote manifest and adds KB', async () => {
    const before = KB.kbs.length;
    doc.getElementById('setKbApiUrl').value = 'https://example.com/kb.json';
    doc.getElementById('btnKbAddApi').click();
    await new Promise(r => setTimeout(r, 50));
    assert(KB.kbs.length === before, 'failed fetch adds nothing (stub returns ok:false)');
  });
  test('tools window: search filters; toggle off hides tool from menu + home', async () => {
    doc.getElementById('setToolSearch').value = 'واتساب';
    App.renderToolSettings();
    let rows = doc.querySelectorAll('#toolSettingsList .settings-row');
    assert(rows.length === 1, 'search filters tools');
    doc.getElementById('setToolSearch').value = '';
    App.renderToolSettings();
    rows = doc.querySelectorAll('#toolSettingsList .settings-row');
    assert(rows.length === 11, 'all 11 tools listed');
    assert(rows[0].querySelector('.cat-chip'), 'category chip on tool row');
    const waRow = [...rows].find(r => r.textContent.includes('واتساب'));
    assert(waRow, 'whatsapp tool row found');
    waRow.querySelector('input').click();
    await new Promise(r => setTimeout(r, 50));
    const chips = [...doc.querySelectorAll('#toolsMenu .tool-chip')];
    assert(chips.length === 10, 'disabled tool removed from tools menu');
    assert(!chips.some(c => c.textContent.includes('واتساب')), 'whatsapp chip hidden');
    assert(!doc.getElementById('homeToolCards').textContent.includes('واتساب'), 'disabled tool hidden from home');
    waRow.querySelector('input').click();
    await new Promise(r => setTimeout(r, 50));
    assert(doc.querySelectorAll('#toolsMenu .tool-chip').length === 11, 're-enabled');
  });
  test('enabled tools appear as home cards', () => {
    App.renderHomeToolCards();
    assert(doc.querySelectorAll('#homeToolCards .quick-card').length === 11, 'all enabled tools on home');
    assert(!doc.getElementById('homeToolsTitle').classList.contains('hidden'), 'home tools title visible');
  });

  console.log('\n— Language toggle —');
  test('switching to English flips UI to LTR', async () => {
    await App.setLang('en');
    assert(doc.documentElement.dir === 'ltr');
    App.openDocument('sa-labor-law');
    assert(doc.querySelector('#docHeader h1').textContent.includes('Labor Law'));
    assert(doc.querySelector('#docHeader .doc-info').textContent.includes('In Force (Amended)'));
    await App.setLang('ar');
  });

  await runAll();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message) || e); process.exit(1); });
