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
let progressCb = null;
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
  onUpdateAvailable: (cb) => { updateCb = cb; },
  rescanFolder: async () => ({ ok: true, count: 2, kb: { id: 'kb-local-test', name: { ar: '\u0645\u062d\u0644\u064a', en: 'Local' }, icon: '\ud83d\udcc1', documents: [] } }),
  onKbProgress: (cb) => { progressCb = cb; }
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
    ['btnRailHome', 'btnAgents', 'btnTools', 'btnNotes', 'btnDrawer']
      .forEach(id => assert(rail.querySelector('#' + id), id + ' in rail'));
    assert(!doc.getElementById('btnChat'), 'rail chat button removed');
    assert(!doc.getElementById('btnGraph'), 'rail graph button removed');
    assert(!doc.getElementById('btnRailKb'), 'rail folder icon removed');
    assert(!doc.getElementById('kbMenu'), 'rail KB menu removed');
    assert(doc.getElementById('toolRail'), 'tool rail container present');
    assert(!doc.querySelector('#topbar .logo-full'), 'logo image removed from topbar');
    assert(!doc.getElementById('btnKbMenu'), 'folder icon removed from topbar');
    assert(doc.querySelector('#topbar .brand #btnKbPicker svg'), 'classic monochrome DB cylinder picker button before search');
    assert(doc.querySelectorAll('#btnKbPicker').length === 1, 'single KB picker button (books icon removed)');
    assert(doc.getElementById('btnSearchMode') && doc.getElementById('searchModeMenu'), 'search mode dropdown button present');
    assert(!doc.getElementById('btnSearchExpand'), 'search expand button removed (v1.6.7)');
  });
  test('rail view buttons always visible (settings toggles removed in v1.6.2); drawer gear visible', () => {
    ['btnAgents', 'btnTools', 'btnNotes'].forEach(id =>
      assert(!doc.getElementById(id).classList.contains('hidden'), id + ' visible'));
    assert(!doc.getElementById('btnDrawer').classList.contains('hidden'));
  });
  test('home: hero + quick cards removed; updates feed kept as boxes grid', () => {
    assert(!doc.querySelector('.hero'), 'hero removed');
    assert(!doc.getElementById('quickCards'), 'quick cards removed');
    assert(!doc.getElementById('btnOpenSite'), 'site button removed');
    assert(doc.querySelectorAll('.feed-item').length >= 5, 'updates feed kept');
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
    assert(!doc.getElementById('docOriginal').querySelector('.article-card'), 'original tab is PDF-only, no text copy');
    assert(doc.getElementById('docOriginal').querySelector('.hint'), 'noOriginalPdf hint when doc has no PDF');
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

  console.log('\n— Document chat (right column only) —');
  test('doc chat lives in the right column; plain Q/A; refusal as warning callout', async () => {
    assert(!doc.getElementById('chatInput'), 'standalone chat view removed — chat only in right column');
    assert(!doc.getElementById('view-chat'), 'view-chat section removed');
    App.openDocument('sa-labor-law');
    App.showView('doc');
    doc.querySelector('#rightTabs [data-tab=chat]').click();
    assert(!doc.getElementById('rpaneChat').classList.contains('hidden'), 'chat pane in right column');
    doc.getElementById('docChatInput').value = 'ما أحكام مكافأة نهاية الخدمة عند الاستقالة؟';
    await App.sendDocChat();
    assert(doc.querySelector('#docChatLog .chat-q'), 'plain question element');
    assert(doc.querySelector('#docChatLog .chat-a .doc-body'), 'plain answer element');
    assert(!doc.querySelector('#docChatLog .msg.user'), 'no bubble for question');
    doc.getElementById('docChatInput').value = 'ما سعر البيتكوين اليوم؟';
    await App.sendDocChat();
    const answers = [...doc.querySelectorAll('#docChatLog .chat-a')];
    assert(answers[answers.length - 1].querySelector('.callout.co-warning'), 'refusal rendered as warning callout');
  });

  console.log('\n— Markdown callouts —');
  test('Obsidian-style callouts render with colors', () => {
    const el = window.eval('renderMarkdown')('> [!WARNING]\n> نص تحذيري\n\n> [!TIP]\n> نصيحة\n');
    assert(el.querySelector('.callout.co-warning'));
    assert(el.querySelector('.callout.co-tip'));
  });

  console.log('\n— Agents (single AI DaAIx assistant, Copilot-style chat) —');
  test('agents view is a single AI DaAIx chat: no chips menu, log, input, classic arrow', async () => {
    Agents.open('consultant');
    assert(!doc.getElementById('agentsMenu'), 'agents chips menu removed from page');
    assert(!doc.querySelector('#agentWorkspace .agent-head'), 'no AI DaAIx title header (v1.6.7)');
    assert(doc.getElementById('agentLog'), 'chat log exists');
    assert(doc.getElementById('agentInput'), 'chat input exists');
    assert(doc.getElementById('agentInput').placeholder.includes('@'), 'placeholder mentions @ context');
    assert(doc.getElementById('agentSend').textContent === '↑', 'classic simple arrow send button');
    doc.getElementById('agentInput').value = 'ما أحكام مكافأة نهاية الخدمة عند الفصل؟';
    await Agents.send();
    const answers = [...doc.querySelectorAll('#agentLog .chat-a')];
    const last = answers[answers.length - 1];
    assert(last.querySelector('.doc-body'), 'agent answered in chat');
    const md = last.textContent;
    assert(md.includes('المادة') || md.includes('نظام'), 'grounded KB passages in answer');
    const src = last.querySelector('.chat-sources');
    assert(src && src.querySelectorAll('.src-title').length >= 1, 'sources shown at top as document titles');
    assert(!last.querySelector('.chat-q'), 'no agent-label header inside answer');
    const acts = last.querySelectorAll('.answer-actions .act-icon');
    assert(acts.length === 2, 'exactly two icon actions: copy + import-to-notes');
    const copyBtn = [...acts].find(b => b.textContent.trim() === '\u2750');
    assert(copyBtn && copyBtn.title, 'copy button is the classic two-squares glyph, no text');
    assert(!copyBtn.classList.contains('primary'), 'copy button not brown/primary');
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
    assert(doc.querySelectorAll('#toolsMenu .tool-chip').length === 10, '10 tools now (consultant removed)');
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
  test('drawer opens with account; rail-button toggles section removed (v1.6.2)', async () => {
    App.openDrawer();
    assert(!doc.getElementById('drawer').classList.contains('hidden'));
    assert(doc.getElementById('accountArea').querySelectorAll('button').length === 2, 'login + register');
    assert(!doc.getElementById('buttonToggles'), 'buttonToggles removed from drawer');
    assert(!doc.querySelector('[data-i18n=showButtons]'), 'showButtons section removed');
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

  console.log('\n— Home hover panel + tool rail —');
  test('enabled tools appear as monochrome icons in the rail; click opens the tool', () => {
    App.renderToolRail();
    const btns = doc.querySelectorAll('#toolRail .tool-rail-btn');
    assert(btns.length === 10, 'all enabled tools in rail');
    assert(btns[0].title.length > 2, 'tooltip shows tool name');
    btns[3].click();
    assert(!doc.getElementById('view-tools').classList.contains('hidden'), 'tool opens from rail');
  });
  test('home hover KB panel (strip + panel) permanently removed (v1.6.1)', () => {
    assert(!doc.getElementById('homeKbStrip'), 'homeKbStrip removed');
    assert(!doc.getElementById('homeKbPanel'), 'homeKbPanel removed');
    assert(!doc.getElementById('hkCats'), 'hkCats removed');
    assert(!doc.getElementById('hkDocs'), 'hkDocs removed');
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
  test('settings tabs: four windows switch panes', () => {
    App.showView('settings');
    const tabs = doc.querySelectorAll('#setTabs .set-tab');
    assert(tabs.length === 4, 'four settings windows');
    assert(!doc.getElementById('setPaneSettings').classList.contains('hidden'), 'settings pane visible first');
    assert(doc.getElementById('setPaneKbs').classList.contains('hidden'));
    assert(doc.getElementById('setPaneTools').classList.contains('hidden'));
    assert(doc.getElementById('setPaneAi').classList.contains('hidden'));
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
    assert(rows.length === 10, 'all 10 tools listed');
    assert(rows[0].querySelector('.cat-chip'), 'category chip on tool row');
    const waRow = [...rows].find(r => r.textContent.includes('واتساب'));
    assert(waRow, 'whatsapp tool row found');
    waRow.querySelector('input').click();
    await new Promise(r => setTimeout(r, 50));
    const chips = [...doc.querySelectorAll('#toolsMenu .tool-chip')];
    assert(chips.length === 9, 'disabled tool removed from tools menu');
    assert(!chips.some(c => c.textContent.includes('واتساب')), 'whatsapp chip hidden');
    assert(!doc.getElementById('homeToolCards').textContent.includes('واتساب'), 'disabled tool hidden from home');
    waRow.querySelector('input').click();
    await new Promise(r => setTimeout(r, 50));
    assert(doc.querySelectorAll('#toolsMenu .tool-chip').length === 10, 're-enabled');
  });
  test('enabled tools appear as home cards', () => {
    App.renderHomeToolCards();
    assert(doc.querySelectorAll('#homeToolCards .quick-card').length === 10, 'all enabled tools on home');
    assert(!doc.getElementById('homeToolsTitle').classList.contains('hidden'), 'home tools title visible');
  });

  console.log('\n— Search: text + semantic (v1.6) —');
  test('typing in search shows detailed result cards with mode tabs; feed hidden', () => {
    App.showView('home');
    const input = doc.getElementById('globalSearch');
    input.value = 'العمل';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const items = doc.querySelectorAll('#searchResults .sr-item');
    assert(items.length >= 3, 'results visible under search');
    assert(doc.getElementById('updatesFeed').classList.contains('hidden'), 'feed hidden while searching');
    assert(doc.querySelector('#searchResults .sr-kbname'), 'searched KB name in results header');
    assert(doc.querySelectorAll('#searchResults .sr-cat').length === 8, '8 classification chips centered');
    assert(doc.querySelector('#searchResults .sr-cat.active').dataset.cat === 'all', 'all chip active by default');
    assert(doc.querySelector('#searchResults .sr-count').textContent.includes('3') ||
           doc.querySelector('#searchResults .sr-count').textContent.length > 1, 'result count shown');
    const first = items[0];
    assert(first.querySelector('.chip.type'), 'type chip on result');
    assert(first.textContent.includes('عرض التفاصيل'), 'view details link');
    const props = first.querySelector('.sr-props').textContent;
    assert(props.includes('مرسوم ملكي') || props.includes('أداة الإصدار'), 'issuing tool in result');
    assert(props.includes('ساري'), 'legislative status in result');
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert(!doc.getElementById('updatesFeed').classList.contains('hidden'), 'feed restored on clear');
  });
  test('semantic search mode returns ranked results', () => {
    App.setSearchMode('semantic');
    const input = doc.getElementById('globalSearch');
    input.value = 'مكافأة نهاية الخدمة';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const items = doc.querySelectorAll('#searchResults .sr-item');
    assert(items.length >= 1, 'semantic results shown');
    assert(App.searchMode === 'semantic', 'semantic mode active');
    App.setSearchMode('text');
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });

  console.log('\n— v1.6.1: mode dropdown, expand, category filter, PDF-only original —');
  test('search mode button opens a dropdown with two options; selecting semantic switches mode', () => {
    const btn = doc.getElementById('btnSearchMode');
    const menu = doc.getElementById('searchModeMenu');
    btn.click();
    assert(!menu.classList.contains('hidden'), 'mode menu visible after click');
    assert(menu.querySelectorAll('.kb-menu-item').length === 2, 'two mode options');
    const items = menu.querySelectorAll('.kb-menu-item');
    items[1].click();
    assert(App.searchMode === 'semantic', 'semantic selected from dropdown');
    assert(menu.classList.contains('hidden'), 'menu closes after selection');
    App.setSearchMode('text');
    assert(App.searchMode === 'text');
  });
  test('v1.6.7 cleanup: no search expand button, no agents title, consultant tool deleted', () => {
    assert(!doc.getElementById('btnSearchExpand'), 'expand button absent');
    assert(!doc.querySelector('#agentWorkspace .agent-head'), 'no AI DaAIx header above the chat');
    assert(!Tools.list().some(t => t.id === 'consultant'), 'consultant tool removed from tools');
  });
  test('v1.6.7: dark theme document paper follows the dark palette', () => {
    const fs = require('fs');
    const css = fs.readFileSync('renderer/css/app.css', 'utf-8');
    assert(css.includes('body.theme-dark { --paper: #161d2e;'), 'dark paper variable override');
    assert(css.includes('body.theme-dark .doc-paper .co-note'), 'dark callout overrides');
  });
  test('category chip filters results by document type', () => {
    App.showView('home');
    const input = doc.getElementById('globalSearch');
    input.value = 'العمل';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const lawChip = doc.querySelector('#searchResults .sr-cat[data-cat=law]');
    assert(lawChip, 'law chip exists');
    lawChip.click();
    assert(App.searchCat === 'law', 'searchCat set to law');
    const items = doc.querySelectorAll('#searchResults .sr-item');
    assert(items.length >= 1, 'law-filtered results shown');
    items.forEach(it => {
      const chip = it.querySelector('.chip.type');
      assert(chip && chip.classList.contains('t-law'), 'all filtered results are law type');
    });
    assert(doc.querySelector('#searchResults .sr-cat.active').dataset.cat === 'law', 'law chip active');
    App.searchCat = 'all';
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  test('original document tab shows official PDF frame only — no text, no editing', () => {
    App.openDocument('sa-labor-law');
    const pane = doc.getElementById('docOriginal');
    assert(pane, 'original pane exists');
    assert(!pane.querySelector('.article-card'), 'no textual article cards in original tab');
    const hint = pane.querySelector('.hint');
    assert(hint && hint.textContent.length > 5, 'noOriginalPdf hint for sample docs without PDF');
    App.showView('home');
  });

  console.log('\n— v1.6.2: brand logo, AI & agents window —');
  test('topbar brand hosts the classic DB cylinder KB picker (no logo image, no brown text)', () => {
    const btn = doc.querySelector('#topbar .brand #btnKbPicker');
    assert(btn && btn.querySelector('svg'), 'DB cylinder picker button in brand position');
    assert(!doc.querySelector('#topbar .logo-full'), 'logo image removed');
    assert(!doc.querySelector('#topbar .brand .brand-name'), 'brown brand-name text removed');
  });
  test('settings has 4th window: AI & agents with models, agents, commands, skills', () => {
    App.showView('settings');
    App.fillSettings();
    const tabs = doc.querySelectorAll('#setTabs .set-tab');
    assert(tabs.length === 4, 'four settings windows');
    doc.querySelector('#setTabs [data-set=ai]').click();
    assert(!doc.getElementById('setPaneAi').classList.contains('hidden'), 'AI pane visible');
    assert(doc.getElementById('setLlmUrl') && doc.getElementById('setLlmKey') && doc.getElementById('setLlmModel'), 'LLM fields moved to AI pane');
    assert(doc.getElementById('modelPresets'), 'model presets datalist');
    assert(doc.querySelectorAll('#agentSettingsList .settings-row').length === 6, 'six agents with toggles');
    assert(doc.querySelectorAll('#commandList .cmd-item').length >= 5, 'quick commands listed');
    assert(doc.querySelectorAll('#skillList .cmd-item').length >= 5, 'skills listed');
    assert(!doc.querySelector('#setPaneSettings #setLlmUrl'), 'LLM fields removed from main settings pane');
  });
  test('agent toggles gate internal routing (Agents.visible)', () => {
    App.settings.agentsEnabled = { memo: false };
    assert(Agents.visible().length === 5, 'disabled agent excluded from routing');
    App.settings.agentsEnabled = {};
    assert(Agents.visible().length === 6, 're-enabled');
  });
  test('command run button opens agents with prompt prefilled', () => {
    App.showView('settings');
    App.fillSettings();
    doc.querySelector('#setTabs [data-set=ai]').click();
    const btn = doc.querySelector('#commandList .cmd-run');
    btn.click();
    assert(!doc.getElementById('view-agents').classList.contains('hidden'), 'agents view opened');
    assert(doc.getElementById('agentInput').value.length > 3, 'prompt prefilled');
  });

  console.log('\n— v1.6.3: markdown TOC tree, info strip, unified paper background —');
  test('markdown headings render as real h1-h6', () => {
    const md = window.eval('renderMarkdown')('# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6');
    ['H1','H2','H3','H4','H5','H6'].forEach((t, i) => {
      const el = md.querySelector('h' + (i + 1));
      assert(el && el.textContent === t, 'heading h' + (i + 1) + ' rendered');
    });
  });
  test('TOC builds a collapsible tree: children nested under parents, toggle collapses', () => {
    App.openDocument('sa-labor-law');
    const body = doc.getElementById('docBody');
    body.innerHTML = '<h1 id="t1">One</h1><h2 id="t2">Two</h2><h3 id="t3">Three</h3><h2 id="t4">TwoB</h2>';
    App.buildToc();
    const nodes = doc.querySelectorAll('#tocItems .toc-node');
    assert(nodes.length === 4, 'four toc nodes');
    const first = nodes[0];
    const kids = first.querySelector(':scope > .toc-children');
    assert(kids && kids.querySelectorAll(':scope > .toc-node').length === 2, 'h2 nodes nested under h1');
    const nested = kids.querySelector(':scope > .toc-node > .toc-children');
    assert(nested && nested.querySelectorAll(':scope > .toc-node').length === 1, 'h3 nested under h2');
    const tg = first.querySelector(':scope > .toc-item > .toc-toggle');
    assert(tg.textContent !== '', 'toggle mark present');
    tg.click();
    assert(kids.classList.contains('collapsed'), 'collapsing h1 hides its subtree');
    assert(tg.textContent === '\u25b8', 'toggle flipped to collapsed arrow');
    tg.click();
    assert(!kids.classList.contains('collapsed'), 'expanding restores subtree');
  });
  test('document info strip: horizontal items merged with top of page', () => {
    App.openDocument('sa-labor-law');
    const strip = doc.querySelector('#docHeader .doc-info');
    assert(strip, 'info strip present');
    const items = strip.querySelectorAll('.info-item');
    assert(items.length === 6, 'six info items');
    assert(!strip.querySelector('.prop-row'), 'vertical rows replaced');
    assert(strip.querySelector('.il') && strip.querySelector('.iv'), 'label + value spans');
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

  console.log('\n— v1.6.5: no graph, mode icon, chat expand, feed list view —');
  test('relation graph removed entirely', () => {
    assert(!doc.getElementById('btnGraph'), 'no graph rail button');
    assert(!doc.getElementById('view-graph'), 'no graph view');
    assert(!doc.getElementById('graphCanvas'), 'no graph canvas');
    assert(!doc.getElementById('graphHint'), 'no graph hint');
    let threw = false;
    try { window.eval('Graph'); } catch (e) { threw = true; }
    assert(threw, 'Graph object no longer defined');
  });
  test('search mode button icon reflects the active mode', () => {
    const btn = doc.getElementById('btnSearchMode');
    App.setSearchMode('text');
    assert(btn.textContent === '\uD83D\uDD0D', 'lens icon in text mode');
    App.setSearchMode('semantic');
    assert(btn.textContent === '\u2728', 'AI sparkle icon in semantic mode');
    App.setSearchMode('text');
  });
  test('doc chat expand button toggles wide right column', () => {
    App.openDocument('sa-labor-law');
    App.showView('doc');
    doc.querySelector('#rightTabs [data-tab=chat]').click();
    const btn = doc.getElementById('docChatExpand');
    assert(btn, 'expand button inside the right column chat');
    btn.click();
    assert(doc.body.classList.contains('chat-expanded'), 'chat expanded');
    assert(btn.textContent === '\u2923', 'collapse icon while expanded');
    btn.click();
    assert(!doc.body.classList.contains('chat-expanded'), 'chat restored');
  });
  test('feed view toggle: boxes grid <-> stacked list, persisted', () => {
    const feed = doc.getElementById('updatesFeed');
    const btn = doc.getElementById('btnFeedView');
    assert(btn, 'feed view toggle button next to feed title');
    assert(!feed.classList.contains('feed-list'), 'grid by default');
    btn.click();
    assert(feed.classList.contains('feed-list'), 'stacked list after toggle');
    assert(btn.textContent === '\u25a6', 'grid icon while listed');
    btn.click();
    assert(!feed.classList.contains('feed-list'), 'back to grid');
  });

  console.log('\n— v1.6.4: providers, # trigger, + context button, usage quota —');
  test('AI providers section renders 5 provider rows and persists via save', async () => {
    App.showView('settings');
    App.fillSettings();
    doc.querySelector('#setTabs [data-set=ai]').click();
    const rows = doc.querySelectorAll('#providerList .provider-row');
    assert(rows.length === 5, 'five provider presets (OpenAI, Claude, DeepSeek, Gemini, Custom)');
    const row = rows[0];
    row.querySelector('[data-p=apiKey]').value = 'sk-test-123';
    row.querySelector('[data-p=enabled]').checked = true;
    row.querySelector('input[name=activeProvider]').checked = true;
    await App.saveSettingsForm();
    const provs = App.settings.providers;
    assert(provs.length === 5 && provs[0].apiKey === 'sk-test-123', 'provider key persisted');
    assert(App.settings.activeProvider === 'openai', 'active provider persisted');
  });
  test('# trigger shows KB/doc autocomplete and adds a scoped chip', () => {
    Agents.open('consultant');
    const input = doc.getElementById('agentInput');
    input.value = '#عمل';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const popup = doc.getElementById('ctxPopup');
    assert(!popup.classList.contains('hidden'), '# popup visible');
    popup.querySelector('.ctx-item').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert(doc.querySelectorAll('#ctxChips .ctx-chip').length === 1, 'chip added from # trigger');
  });
  test('+ button opens context menu and adds a KB chip', () => {
    const plus = doc.getElementById('chatPlusBtn');
    assert(plus, '+ button below input');
    plus.click();
    const popup = doc.getElementById('plusPopup');
    assert(!popup.classList.contains('hidden'), 'plus menu visible');
    popup.querySelector('.ctx-item').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert(doc.querySelectorAll('#ctxChips .ctx-chip').length >= 1, 'chip added via + button');
  });
  test('usage quota meter shows 4 stages and increments after send', async () => {
    const Usage = window.eval('Usage');
    const meter = doc.getElementById('usageMeter');
    assert(meter.querySelectorAll('.usage-stage').length === 4, 'hourly/daily/weekly/monthly stages');
    const before = Usage.remaining().find(r => r.id === 'daily').used;
    const input = doc.getElementById('agentInput');
    input.value = 'ما أحكام مكافأة نهاية الخدمة؟';
    await Agents.send();
    const after = Usage.remaining().find(r => r.id === 'daily').used;
    assert(after === before + 1, 'usage bumped after send');
    assert(doc.getElementById('usageMeter').textContent.includes('يومي'), 'daily stage shown in meter');
  });

  console.log('\n— v1.6.7 browser-style tabs —');
  test('tabs: opening documents creates titled tabs, switch and close like a browser', () => {
    App.tabs = [{ id: 'home', kind: 'home' }];
    App.activeTab = 'home';
    App.renderTabBar();
    const first = KB.index[0].doc.id;
    const second = KB.index[1].doc.id;
    App.openDocument(first);
    App.openDocument(second);
    const bar = doc.getElementById('tabBar');
    assert(!bar.classList.contains('hidden'), 'tab bar visible with open windows');
    const tabs = bar.querySelectorAll('.app-tab');
    assert(tabs.length === 3, 'home + two document tabs');
    assert(tabs[0].querySelector('.tab-title').textContent.length > 0, 'home tab titled');
    const I18nG = window.eval('I18n');
    const t2 = KB.get(second);
    const t2Title = t2.title[I18nG.lang] || t2.title.ar || t2.title.en;
    assert([...bar.querySelectorAll('.app-tab .tab-title')].some(el => el.textContent === t2Title), 'doc tab titled with document title');
    assert(doc.getElementById('view-doc').classList.contains('hidden') === false, 'second doc active');
    tabs[0].click();
    assert(!doc.getElementById('view-home').classList.contains('hidden'), 'switching to home tab shows home');
    const closeBtns = bar.querySelectorAll('.app-tab .tab-close');
    closeBtns[closeBtns.length - 1].click();
    assert(bar.querySelectorAll('.app-tab').length === 2, 'tab closed');
  });
  test('tabs: agents and tools open as named windows; reopening same doc reuses its tab', () => {
    Agents.open('consultant');
    const bar = doc.getElementById('tabBar');
    const titles = [...bar.querySelectorAll('.app-tab .tab-title')].map(el => el.textContent);
    assert(titles.includes('AI DaAIx'), 'agents window titled AI DaAIx');
    Tools.open('converter');
    const titles2 = [...bar.querySelectorAll('.app-tab .tab-title')].map(el => el.textContent);
    assert(titles2.some(t => t.includes(Tools.list().find(x => x.id === 'converter').label)), 'tools window titled with tool name');
    const before = bar.querySelectorAll('.app-tab').length;
    App.openDocument(KB.index[0].doc.id);
    App.openDocument(KB.index[0].doc.id);
    assert(bar.querySelectorAll('.app-tab').length === before, 'reopening the same document reuses its tab');
    assert(App.tabs.length <= 10, 'tab cap of 10 respected');
  });

  console.log('\n— v1.6.8 KB sources & progress —');
  test('KB pane offers folder / cloud / platform sources; cloud panel lists providers', () => {
    ['btnKbSourceFolder', 'btnKbSourceCloud', 'btnKbSourcePlatform'].forEach(id => assert(doc.getElementById(id), id));
    doc.getElementById('btnKbSourceCloud').click();
    const panel = doc.getElementById('kbCloudPanel');
    assert(!panel.classList.contains('hidden'), 'cloud panel opens');
    assert(panel.querySelectorAll('.cloud-row').length >= 8, 'cloud providers + direct link listed');
    assert(panel.textContent.includes('Google Drive') && panel.textContent.includes('OneDrive') && panel.textContent.includes('Dropbox'), 'major providers present');
    doc.getElementById('btnKbSourcePlatform').click();
    assert(!doc.getElementById('kbPlatformPanel').classList.contains('hidden'), 'platform panel opens');
    assert(doc.getElementById('setKbApiKey'), 'platform API key field');
    assert(doc.getElementById('setKbApiUrl').defaultValue.includes('smartk-ai.com'), 'platform URL prefilled');
  });
  test('import/conversion progress indicator tracks stages, percent and completion', async () => {
    assert(progressCb, 'progress listener registered');
    progressCb({ stage: 'read', done: 5, total: 10, file: 'doc.md' });
    const bar = doc.getElementById('kbProgress');
    assert(!bar.classList.contains('hidden'), 'progress bar visible');
    assert(doc.getElementById('kbProgressPct').textContent === '50%', 'percent updates');
    assert(doc.getElementById('kbProgressFile').textContent === 'doc.md', 'current file shown');
    progressCb({ stage: 'read', done: 10, total: 10, file: 'z.md' });
    await new Promise(r => setTimeout(r, 1100));
    assert(bar.classList.contains('hidden'), 'bar hides after completion');
  });
  console.log('\n— v1.6.9 search fixes —');
  test('feed-head with view toggle hides during search and returns after clearing', () => {
    const inp = doc.getElementById('globalSearch');
    inp.value = 'نظام العمل';
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert(doc.querySelectorAll('#searchResults .sr-item').length > 0, 'results render');
    assert(doc.getElementById('feedHead').classList.contains('hidden'), 'feed head hidden during search');
    assert(doc.getElementById('updatesFeed').classList.contains('hidden'), 'feed hidden during search');
    inp.value = '';
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert(!doc.getElementById('feedHead').classList.contains('hidden'), 'feed head visible again after clearing');
  });
  test('category filter resets when a NEW query is typed; kept for chip clicks', () => {
    const inp = doc.getElementById('globalSearch');
    inp.value = 'نظام العمل';
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
    App.searchCat = 'ruling';
    App.search('نظام العمل');
    assert(App.searchCat === 'ruling', 'same query keeps selected category');
    inp.value = 'اتفاقية';
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert(App.searchCat === 'all', 'new query resets category to all');
    assert(doc.querySelectorAll('#searchResults .sr-item').length > 0, 'results after reset are not filtered');
  });
  test('empty results show a clear no-results hint', () => {
    const inp = doc.getElementById('globalSearch');
    inp.value = 'zzzzqqq';
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
    const hint = doc.querySelector('#searchResults .hint');
    assert(hint && hint.textContent.trim().length > 2, 'no-results hint shown');
    inp.value = '';
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
  });

  console.log('\n— v1.6.10 chat input, expand & tab bar —');
  test('doc chat input: placeholder reworded, small font, dark-mode visible colors', () => {
    App.openDocument(KB.index[0].doc.id);
    const ta = doc.getElementById('docChatInput');
    assert(ta.placeholder.includes('وما يتعلق بها'), 'placeholder reworded');
    const css = [...doc.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } });
    const taRule = css.filter(r => r.selectorText && r.selectorText.includes('#rpaneChat textarea')).pop();
    assert(taRule && taRule.style.fontSize === '13px', 'doc chat input font is smaller');
    const bgRule = css.filter(r => r.selectorText === '.chat-input-row textarea').pop();
    assert(bgRule && bgRule.style.background.includes('var(--bg3)'), 'chat inputs use theme background (visible typed text in dark mode)');
    assert(bgRule && bgRule.style.color.includes('var(--text)'), 'chat inputs use theme text color');
  });
  test('chat expand covers the whole window; leaving chat tab or reopening doc reverts it', () => {
    App.openDocument(KB.index[0].doc.id);
    doc.getElementById('docChatExpand').click();
    assert(doc.body.classList.contains('chat-expanded'), 'expanded');
    assert(doc.defaultView && true, 'jsdom ok');
    const css = [...doc.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } });
    const tocHide = css.filter(r => r.selectorText && r.selectorText.includes('body.chat-expanded #docToc')).pop();
    const centerHide = css.filter(r => r.selectorText && r.selectorText.includes('body.chat-expanded #docCenter')).pop();
    const full = css.filter(r => r.selectorText === 'body.chat-expanded #docProps').pop();
    assert(tocHide && tocHide.style.display === 'none', 'expanded: TOC hidden (full window)');
    assert(centerHide && centerHide.style.display === 'none', 'expanded: center column hidden (full window)');
    assert(full && full.style.width === '100%', 'expanded: chat column takes full width');
    doc.querySelector('#rightTabs .rtab[data-tab="rulings"]').click();
    assert(!doc.body.classList.contains('chat-expanded'), 'switching to another right tab reverts expansion');
    assert(doc.getElementById('docChatExpand').textContent === '\u2922', 'expand icon restored');
    doc.getElementById('docChatExpand').click();
    assert(doc.body.classList.contains('chat-expanded'), 'expand again');
    App.openDocument(KB.index[0].doc.id);
    assert(!doc.body.classList.contains('chat-expanded'), 'reopening document resets expansion');
  });
  test('tab bar: prev/next navigation and + opens new window with doc menu', () => {
    App.openDocument(KB.index[1].doc.id);
    App.openDocument(KB.index[2].doc.id);
    const bar = doc.getElementById('tabBar');
    assert(bar.querySelector('.tab-nav-btn'), 'prev/next nav buttons present');
    const activeBefore = App.activeTab;
    bar.querySelectorAll('.tab-nav-btn')[0].click();
    assert(App.activeTab !== activeBefore, 'prev button switches window');
    bar.querySelectorAll('.tab-nav-btn')[1].click();
    assert(App.activeTab === activeBefore, 'next button returns');
    const before = App.tabs.length;
    bar.querySelector('.tab-new-btn').click();
    const menu = doc.getElementById('tabPlusMenu');
    assert(menu && !menu.classList.contains('hidden'), '+ opens new-window menu');
    const items = menu.querySelectorAll('.kb-menu-item');
    assert(items.length > 0, 'menu lists documents');
    items[0].click();
    assert(App.tabs.length === before + 1, 'selecting a doc opens a NEW window even if already open');
    assert(!doc.getElementById('tabPlusMenu').classList.contains('hidden') === false, 'menu closed after selection');
  });

  test('linked folder KBs get a refresh-from-folder action', () => {
    const kb = KB.kbs[0];
    kb.sourcePath = '/tmp/kb';
    App.renderKbSettings();
    assert(doc.querySelector('#kbSettingsList .kb-rescan'), 'refresh button on linked KB');
    delete kb.sourcePath;
    App.renderKbSettings();
    assert(!doc.querySelector('#kbSettingsList .kb-rescan'), 'no refresh button on non-linked KB');
  });

  await runAll();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message) || e); process.exit(1); });
