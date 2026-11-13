'use strict';

/* ---------- markdown renderer (with Obsidian-style callouts) ---------- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const CALLOUTS = {
  note: { cls: 'co-note', icon: '📝' },
  info: { cls: 'co-info', icon: 'ℹ️' },
  tip: { cls: 'co-tip', icon: '💡' },
  warning: { cls: 'co-warning', icon: '⚠️' },
  caution: { cls: 'co-caution', icon: '🚫' },
  danger: { cls: 'co-caution', icon: '🚨' },
  example: { cls: 'co-example', icon: '📄' },
  quote: { cls: 'co-quote', icon: '❝' }
};

function renderMarkdown(md) {
  const div = document.createElement('div');
  div.className = 'doc-body';
  const lines = String(md).split('\n');
  let html = '', inList = false, buf = [];

  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(\d+)\]/g, '<span class="cite">[$1]</span>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" data-ext="1">$1</a>');

  const flushPara = () => {
    if (buf.length) {
      html += `<p>${inline(buf.join(' '))}</p>`;
      buf = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const callout = line.match(/^>\s?\[!(\w+)\]\s*(.*)$/);
    if (callout) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      const type = callout[1].toLowerCase();
      const meta = CALLOUTS[type] || CALLOUTS.note;
      const body = [callout[2]];
      let j = i + 1;
      while (j < lines.length && /^>\s?/.test(lines[j])) {
        body.push(lines[j].replace(/^>\s?/, ''));
        j++;
      }
      i = j - 1;
      const title = body[0] ? inline(body[0]) : '';
      const rest = body.slice(1).filter(Boolean).map(b => inline(b)).join('<br/>');
      html += `<div class="callout ${meta.cls}"><div class="co-title">${meta.icon} ${title || I18n.lang === 'ar' ? meta.icon + ' ' + (title || type.toUpperCase()) : meta.icon + ' ' + (title || type.toUpperCase())}</div>${rest ? `<div class="co-body">${rest}</div>` : ''}</div>`;
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      const level = line.match(/^#+/)[0].length;
      const text = inline(line.replace(/^#+\s*/, ''));
      const anchor = 'h-' + html.length;
      html += `<h${Math.min(level, 4)} id="${anchor}">${text}</h${Math.min(level, 4)}>`;
    } else if (/^>\s?/.test(line)) {
      flushPara();
      html += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`;
    } else if (/^[-*]\s/.test(line)) {
      flushPara();
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`;
    } else if (/^---+\s*$/.test(line)) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr/>';
    } else if (!line.trim()) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
    } else {
      buf.push(line);
    }
  }
  flushPara();
  if (inList) html += '</ul>';
  div.innerHTML = html;
  div.querySelectorAll('a[data-ext]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.daaix) window.daaix.openExternal(a.href);
  }));
  return div;
}

/* ---------- notes ---------- */
const Notes = {
  items: [],
  editingId: null,

  async refresh() {
    this.items = (await window.daaix.notesLoad()) || [];
    const list = document.getElementById('notesList');
    list.innerHTML = '';
    this.items.sort((a, b) => b.modified - a.modified).forEach(n => {
      const title = (n.markdown.match(/^#\s+(.+)$/m) || [, n.id])[1];
      const card = document.createElement('div');
      card.className = 'note-card';
      card.innerHTML = `<div class="nt">${esc(title)}</div><div class="nd">${new Date(n.modified).toLocaleString()}</div>`;
      card.onclick = () => this.edit(n.id);
      list.appendChild(card);
    });
  },

  edit(id) {
    const note = this.items.find(n => n.id === id);
    if (!note) return;
    this.editingId = id;
    document.getElementById('noteEditor').classList.remove('hidden');
    document.getElementById('noteText').value = note.markdown;
  },

  async save() {
    if (!this.editingId) return;
    await window.daaix.notesSave({ id: this.editingId, markdown: document.getElementById('noteText').value });
    App.toast(I18n.t('save') + ' ✓');
    await this.refresh();
  },

  async create() {
    this.editingId = 'note-' + Date.now();
    document.getElementById('noteEditor').classList.remove('hidden');
    document.getElementById('noteText').value = '# ' + I18n.t('newNote') + '\n\n';
    document.getElementById('noteText').focus();
  },

  async remove() {
    if (!this.editingId) return;
    await window.daaix.notesDelete(this.editingId);
    this.editingId = null;
    document.getElementById('noteEditor').classList.add('hidden');
    document.getElementById('noteText').value = '';
    await this.refresh();
  }
};

/* ---------- chat (plain, no bubbles) ---------- */
const Chat = {
  async answer(query, opts = {}) {
    let scopeIds = opts.scopeDocIds || null;
    if (opts.scope === 'current' && App.currentDocId) {
      scopeIds = Retrieval.scopeDocIds(App.currentDocId, 1);
    }
    if (!scopeIds && opts.titleRegex) {
      const ids = new Set();
      KB.index.forEach(e => {
        const t = e.doc.title.ar || e.doc.title.en || '';
        if (opts.titleRegex.test(t)) ids.add(e.doc.id);
      });
      scopeIds = ids.size ? ids : new Set(['__none__']);
    }
    const llmOpts = { scopeDocIds: scopeIds };
    const llm = (window.daaixSettings && window.daaixSettings.llm) || {};
    if (llm.apiKey && llm.baseUrl) {
      const res = await Retrieval.llmAnswer(query, llmOpts);
      if (res) return res;
    }
    return Retrieval.extractiveAnswer(query, llmOpts);
  },

  async send() {
    const input = document.getElementById('chatInput');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    const log = document.getElementById('chatLog');

    const qEl = document.createElement('div');
    qEl.className = 'chat-q';
    qEl.textContent = q;
    log.appendChild(qEl);

    const res = await this.answer(q, { scope: document.getElementById('chatScope').value });

    const aEl = document.createElement('div');
    aEl.className = 'chat-a';
    aEl.appendChild(renderMarkdown(res.answer));

    if (res.passages && res.passages.length) {
      const cites = document.createElement('div');
      cites.className = 'chat-cites';
      cites.innerHTML = `<span>${I18n.t('chatCitations')}:</span>`;
      res.passages.forEach(p => {
        const a = document.createElement('a');
        a.textContent = p.docTitle + (p.articleNum ? ' (' + p.articleNum + ')' : '');
        a.onclick = () => App.openDocument(p.docId);
        cites.appendChild(a);
      });
      aEl.appendChild(cites);
    }
    const tag = document.createElement('span');
    tag.className = 'mode-tag';
    tag.textContent = res.mode === 'llm' ? 'AI + KB' : 'KB (extractive, 100% grounded)';
    aEl.appendChild(tag);
    log.appendChild(aEl);
    log.scrollTop = log.scrollHeight;
  }
};

/* ---------- main app ---------- */
const App = {
  settings: {},
  currentDocId: null,
  currentCat: 'all',
  editing: false,

  async boot() {
    this.settings = (await window.daaix.settingsGet()) || {};
    if (!this.settings.showButtons) {
      this.settings.showButtons = { agents: false, chat: false, graph: false, tools: false, notes: false };
    }
    window.daaixSettings = this.settings;

    I18n.lang = this.settings.language || 'ar';
    this.applyTheme(this.settings.theme || 'dark');

    const sample = await fetch('data/kb-sample.json').then(r => r.json());
    KB.load(sample);
    const downloaded = await window.daaix.kbLoadDownloaded();
    KB.addDownloaded(downloaded);
    Retrieval.build();

    document.getElementById('appVersion').textContent = 'v' + (await window.daaix.appVersion());

    this.bindTopbar();
    this.bindDrawer();
    this.bindViews();
    this.renderAll();
    I18n.apply();

    window.daaix.onUpdateAvailable((data) => {
      this.toast(`${I18n.t('updatesAvailable')}: ${data.updates.length}`);
    });
  },

  applyTheme(theme) {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
  },

  renderAll() {
    this.applyTopbarButtons();
    this.renderCatTabs();
    this.renderDocList();
    this.renderQuickCards();
    this.renderFeed();
    this.renderAccount();
    this.renderButtonToggles();
    this.applyLangUi();
  },

  applyLangUi() {
    document.getElementById('btnLangFix') && (document.getElementById('btnLangFix').textContent = I18n.lang === 'ar' ? 'EN' : 'ع');
    const scope = document.getElementById('chatScope');
    scope.options[0].textContent = I18n.t('chatAll');
    scope.options[1].textContent = I18n.t('chatCurrent');
    document.getElementById('graphHint').textContent = I18n.lang === 'ar'
      ? 'انقر على أي عقدة لفتح الوثيقة — الألوان تمثل نوع الوثيقة'
      : 'Click any node to open the document — colors represent document type';
    const warn = document.getElementById('editWarningText');
    if (warn) warn.textContent = I18n.t('editWarning');
  },

  applyTopbarButtons() {
    const show = this.settings.showButtons || {};
    [['btnAgents', 'agents'], ['btnChat', 'chat'], ['btnGraph', 'graph'], ['btnTools', 'tools'], ['btnNotes', 'notes']]
      .forEach(([id, key]) => {
        document.getElementById(id).classList.toggle('hidden', !show[key]);
      });
  },

  bindTopbar() {
    document.getElementById('brandHome').onclick = () => this.showView('home');
    document.getElementById('btnDrawer').onclick = () => this.openDrawer();
    document.getElementById('btnAgents').onclick = () => Agents.open(Agents.current);
    document.getElementById('btnChat').onclick = () => this.showView('chat');
    document.getElementById('btnGraph').onclick = () => { this.showView('graph'); Graph.show(this.currentDocId); };
    document.getElementById('btnTools').onclick = () => Tools.open(Tools.active || 'consultant');
    document.getElementById('btnNotes').onclick = () => { this.showView('notes'); Notes.refresh(); };
    document.getElementById('btnOpenSite').onclick = () => window.daaix.openExternal('https://smartk-ai.com/');
    document.getElementById('siteLink').onclick = (e) => {
      e.preventDefault();
      window.daaix.openExternal('https://smartk-ai.com/');
    };
    document.getElementById('globalSearch').addEventListener('input', (e) => {
      this.search(e.target.value);
    });
    document.getElementById('sideSearch').addEventListener('input', (e) => {
      this.renderDocList(e.target.value);
    });
  },

  bindDrawer() {
    document.getElementById('btnDrawerClose').onclick = () => this.closeDrawer();
    document.getElementById('drawerOverlay').onclick = () => this.closeDrawer();
    document.getElementById('drawerLang').onchange = async (e) => {
      await this.setLang(e.target.value);
    };
    document.getElementById('drawerTheme').onchange = async (e) => {
      this.applyTheme(e.target.value);
      this.settings.theme = e.target.value;
      await window.daaix.settingsSet({ theme: e.target.value });
    };
    document.getElementById('btnFullSettings').onclick = () => {
      this.closeDrawer();
      this.showView('settings');
      this.fillSettings();
    };
  },

  openDrawer() {
    document.getElementById('drawer').classList.remove('hidden');
    document.getElementById('drawerOverlay').classList.remove('hidden');
    document.getElementById('drawerLang').value = I18n.lang;
    document.getElementById('drawerTheme').value = this.settings.theme || 'dark';
  },

  closeDrawer() {
    document.getElementById('drawer').classList.add('hidden');
    document.getElementById('drawerOverlay').classList.add('hidden');
  },

  renderButtonToggles() {
    const wrap = document.getElementById('buttonToggles');
    wrap.innerHTML = '';
    const defs = [
      ['agents', '🤖 ' + I18n.t('agents')],
      ['chat', '💬 ' + I18n.t('chat')],
      ['graph', '🕸️ ' + I18n.t('graph')],
      ['tools', '🧰 ' + I18n.t('tools')],
      ['notes', '📝 ' + I18n.t('notes')]
    ];
    defs.forEach(([key, label]) => {
      const row = document.createElement('label');
      row.className = 'check-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!(this.settings.showButtons || {})[key];
      cb.onchange = async () => {
        this.settings.showButtons[key] = cb.checked;
        await window.daaix.settingsSet({ showButtons: this.settings.showButtons });
        this.applyTopbarButtons();
      };
      const span = document.createElement('span');
      span.textContent = label;
      row.appendChild(cb);
      row.appendChild(span);
      wrap.appendChild(row);
    });
  },

  renderAccount() {
    const area = document.getElementById('accountArea');
    const acc = this.settings.account;
    area.innerHTML = '';
    if (acc && acc.email) {
      const p = document.createElement('p');
      p.className = 'account-email';
      p.textContent = '👤 ' + acc.email;
      const out = document.createElement('button');
      out.className = 'danger';
      out.textContent = I18n.t('logout');
      out.onclick = async () => {
        this.settings.account = null;
        await window.daaix.settingsSet({ account: null });
        this.renderAccount();
      };
      area.appendChild(p);
      area.appendChild(out);
    } else {
      const login = document.createElement('button');
      login.className = 'primary';
      login.textContent = '🔑 ' + I18n.t('login');
      login.onclick = () => window.daaix.openExternal('https://smartk-ai.com/تسجيل-الدخول'.replace('تسجيل-الدخول', 'login'));
      const reg = document.createElement('button');
      reg.className = 'danger';
      reg.textContent = I18n.t('register');
      reg.onclick = () => window.daaix.openExternal('https://smartk-ai.com/register');
      area.appendChild(login);
      area.appendChild(reg);
    }
  },

  async setLang(lang) {
    I18n.lang = lang;
    await window.daaix.settingsSet({ language: lang });
    I18n.apply();
    this.renderAll();
    if (this.currentDocId) this.openDocument(this.currentDocId);
    if (Tools.active) Tools.render(Tools.active);
    if (Agents.current) { Agents.renderMenu(); Agents.render(); }
  },

  bindViews() {
    document.getElementById('chatSend').onclick = () => Chat.send();
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Chat.send(); }
    });
    document.getElementById('btnNewNote').onclick = () => Notes.create();
    document.getElementById('btnSaveNote').onclick = () => Notes.save();
    document.getElementById('btnDeleteNote').onclick = () => Notes.remove();

    document.getElementById('btnEditDoc').onclick = () => this.toggleEdit();
    document.getElementById('btnSaveEdits').onclick = () => this.saveEdits();
    document.getElementById('btnDiscardEdits').onclick = () => this.discardEdits();

    document.getElementById('btnImportFolder').onclick = async () => {
      const status = document.getElementById('importStatus');
      status.textContent = '...';
      const res = await window.daaix.importFolder();
      if (!res || !res.ok) { status.textContent = (res && res.error) || '—'; return; }
      KB.addDownloaded([res.kb]);
      Retrieval.build();
      await window.daaix.kbSaveDownloaded(res.kb);
      this.renderAll();
      status.textContent = `${I18n.t('imported')}: ${res.count}`;
      this.toast(`${I18n.t('imported')}: ${res.count}`);
    };

    document.getElementById('btnSaveSettings').onclick = async () => {
      const patch = {
        language: document.getElementById('setLang').value,
        theme: document.getElementById('setTheme').value,
        updateUrl: document.getElementById('setUpdateUrl').value,
        llm: {
          baseUrl: document.getElementById('setLlmUrl').value.trim(),
          apiKey: document.getElementById('setLlmKey').value.trim(),
          model: document.getElementById('setLlmModel').value.trim()
        },
        connectors: this.readConnectors()
      };
      this.settings = await window.daaix.settingsSet(patch);
      window.daaixSettings = this.settings;
      this.toast(I18n.t('save') + ' ✓');
    };
    document.getElementById('btnAddConnector').onclick = () => {
      const connectors = this.settings.connectors || [];
      connectors.push({ name: '', url: '', apiKey: '', enabled: true });
      this.settings.connectors = connectors;
      this.renderConnectors();
    };
    document.getElementById('btnCheckUpdates').onclick = async () => {
      const status = document.getElementById('updateStatus');
      status.textContent = '...';
      const res = await window.daaix.kbCheckUpdates();
      if (!res.ok) { status.textContent = res.error || 'error'; return; }
      status.textContent = res.updates.length
        ? `${I18n.t('updatesAvailable')}: ${res.updates.length}`
        : I18n.t('noUpdates');
      if (res.updates.length) this.toast(`${I18n.t('updatesAvailable')}: ${res.updates.length}`);
    };
    document.getElementById('setLang').onchange = (e) => { if (e.target.value !== I18n.lang) this.setLang(e.target.value); };
    document.getElementById('setTheme').onchange = (e) => {
      this.applyTheme(e.target.value);
      window.daaix.settingsSet({ theme: e.target.value });
    };
  },

  fillSettings() {
    document.getElementById('setLang').value = I18n.lang;
    document.getElementById('setTheme').value = this.settings.theme || 'dark';
    document.getElementById('setUpdateUrl').value = this.settings.updateUrl || '';
    const llm = this.settings.llm || {};
    document.getElementById('setLlmUrl').value = llm.baseUrl || '';
    document.getElementById('setLlmKey').value = llm.apiKey || '';
    document.getElementById('setLlmModel').value = llm.model || '';
    this.renderConnectors();
  },

  renderConnectors() {
    const list = document.getElementById('connectorList');
    list.innerHTML = '';
    const connectors = this.settings.connectors || [];
    if (!connectors.length) {
      list.innerHTML = `<p class="hint">—</p>`;
      return;
    }
    connectors.forEach((c, idx) => {
      const row = document.createElement('div');
      row.className = 'connector-row';
      row.innerHTML = `
        <input type="text" data-c="name" placeholder="${I18n.t('connectorName')}" value="${esc(c.name || '')}" />
        <input type="url" data-c="url" placeholder="${I18n.t('connectorUrl')}" value="${esc(c.url || '')}" />
        <input type="password" data-c="apiKey" placeholder="${I18n.t('apiKey')}" value="${esc(c.apiKey || '')}" autocomplete="off" />
        <label class="check-item"><input type="checkbox" data-c="enabled" ${c.enabled !== false ? 'checked' : ''} /></label>
        <button class="danger conn-del">✕</button>`;
      row.querySelector('.conn-del').onclick = () => {
        this.settings.connectors.splice(idx, 1);
        this.renderConnectors();
      };
      list.appendChild(row);
    });
  },

  readConnectors() {
    const rows = [...document.querySelectorAll('#connectorList .connector-row')];
    return rows.map(row => ({
      name: row.querySelector('[data-c=name]').value.trim(),
      url: row.querySelector('[data-c=url]').value.trim(),
      apiKey: row.querySelector('[data-c=apiKey]').value.trim(),
      enabled: row.querySelector('[data-c=enabled]').checked
    })).filter(c => c.url);
  },

  showView(name) {
    ['home', 'doc', 'chat', 'graph', 'agents', 'tools', 'notes', 'settings'].forEach(v => {
      document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
    });
    if (name !== 'graph') Graph.stop();
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.add('hidden'), 2600);
  },

  /* ---------- home ---------- */
  renderQuickCards() {
    const wrap = document.getElementById('quickCards');
    wrap.innerHTML = '';
    [
      { icon: '🤖', label: I18n.t('agents'), desc: I18n.t('agentsDesc'), action: () => Agents.open(Agents.current) },
      { icon: '💬', label: I18n.t('chat'), desc: I18n.t('chatGrounded'), action: () => this.showView('chat') },
      { icon: '🧰', label: I18n.t('tools'), desc: I18n.t('toolConsultant'), action: () => Tools.open(Tools.active || 'consultant') },
      { icon: '🕸️', label: I18n.t('graph'), desc: I18n.t('relationsCount'), action: () => { this.showView('graph'); Graph.show(this.currentDocId); } },
      { icon: '📝', label: I18n.t('notes'), desc: I18n.t('newNote'), action: () => { this.showView('notes'); Notes.refresh(); } }
    ].forEach(c => {
      const card = document.createElement('div');
      card.className = 'quick-card';
      card.innerHTML = `<div class="qc-icon">${c.icon}</div><div class="qc-label">${esc(c.label)}</div><div class="qc-desc">${esc(c.desc)}</div>`;
      card.onclick = c.action;
      wrap.appendChild(card);
    });
  },

  renderFeed() {
    const feed = document.getElementById('updatesFeed');
    feed.innerHTML = '';
    const items = [];
    KB.index.forEach(e => {
      (e.doc.versionHistory || []).forEach(v => {
        items.push({
          date: v.date || '',
          change: v.change ? (v.change.ar || v.change.en || '') : '',
          by: v.by || '',
          version: v.version,
          doc: e.doc
        });
      });
    });
    items.sort((a, b) => String(b.date).localeCompare(String(a.date), 'ar'));
    items.slice(0, 10).forEach(it => {
      const isNew = (it.doc.versionHistory || []).length === 1 || it.version === 1;
      const card = document.createElement('div');
      card.className = 'feed-item';
      card.innerHTML = `
        <span class="feed-badge ${isNew ? 'new' : 'upd'}">${isNew ? I18n.t('newBadge') : I18n.t('updateBadge')}</span>
        <div class="feed-main">
          <div class="feed-title-doc">${esc(it.doc.title[I18n.lang] || it.doc.title.ar || it.doc.title.en)}</div>
          <div class="feed-meta">${I18n.docTypeName(it.doc.type)} · ${I18n.t('version')} ${it.version} · ${esc(it.date)}${it.by ? ' · ' + esc(it.by) : ''}</div>
          ${it.change ? `<div class="feed-change">${esc(it.change)}</div>` : ''}
        </div>`;
      card.onclick = () => this.openDocument(it.doc.id);
      feed.appendChild(card);
    });
  },

  /* ---------- sidebar: categories + search list ---------- */
  renderCatTabs() {
    const tabs = document.getElementById('catTabs');
    tabs.innerHTML = '';
    [['all', 'catAll'], ['legal', 'catLegal'], ['circulars', 'catCirculars'], ['rulings', 'catRulings'], ['agreements', 'catAgreements'], ['notes', 'catNotes']]
      .forEach(([id, key]) => {
        const tab = document.createElement('button');
        tab.className = 'cat-tab' + (this.currentCat === id ? ' active' : '');
        tab.textContent = I18n.t(key);
        tab.onclick = () => {
          this.currentCat = id;
          this.renderCatTabs();
          this.renderDocList(document.getElementById('sideSearch').value);
        };
        tabs.appendChild(tab);
      });
  },

  renderDocList(query) {
    const list = document.getElementById('docList');
    list.innerHTML = '';
    const docs = KB.listByCat(this.currentCat, query || '');
    if (!docs.length) {
      list.innerHTML = `<p class="hint" style="padding:12px">—</p>`;
      return;
    }
    docs.forEach(doc => {
      const item = document.createElement('div');
      item.className = 'doc-item' + (doc.id === this.currentDocId ? ' active' : '');
      const title = doc.title[I18n.lang] || doc.title.ar || doc.title.en;
      item.innerHTML = `<span class="doc-item-title">${esc(title)}</span><span class="doc-item-type">${I18n.docTypeName(doc.type)}</span>`;
      item.onclick = () => this.openDocument(doc.id);
      list.appendChild(item);
    });
  },

  search(q) {
    const box = document.getElementById('searchResults');
    this.showView('home');
    if (!q || q.trim().length < 2) { box.innerHTML = ''; return; }
    const results = KB.search(q.trim(), 30);
    box.innerHTML = '';
    if (!results.length) {
      box.innerHTML = `<p style="color:var(--muted);text-align:center;padding:20px">—</p>`;
      return;
    }
    results.forEach(r => {
      const doc = r.doc;
      const title = doc.title[I18n.lang] || doc.title.ar || doc.title.en;
      const item = document.createElement('div');
      item.className = 'sr-item';
      const snippet = (doc.summary ? (doc.summary.ar || doc.summary.en || '') : (doc.body || '')).slice(0, 160);
      item.innerHTML = `<div class="t">${esc(title)}</div>
        <div class="m">${I18n.docTypeName(doc.type)} · ${Math.round(r.score * 100)}</div>
        <div class="snip">${esc(snippet)}…</div>`;
      item.onclick = () => { document.getElementById('globalSearch').value = ''; this.openDocument(doc.id); };
      box.appendChild(item);
    });
  },

  /* ---------- document reader ---------- */
  openDocument(id) {
    const doc = KB.get(id);
    if (!doc) return;
    this.currentDocId = id;
    this.editing = false;
    this.showView('doc');
    this.renderDocList(document.getElementById('sideSearch').value);

    const title = doc.title[I18n.lang] || doc.title.ar || doc.title.en;
    const header = document.getElementById('docHeader');
    header.innerHTML = `
      <h1>${esc(title)}</h1>
      <div class="doc-chips">
        <span class="chip type">${I18n.docTypeName(doc.type)}</span>
        <span class="chip status">${I18n.t('status_' + (doc.status || 'in_force'))}</span>
      </div>`;

    const paper = document.getElementById('docPaper');
    paper.classList.remove('editing');

    const bodyEl = document.getElementById('docBody');
    bodyEl.contentEditable = 'false';
    bodyEl.innerHTML = '';

    const overlay = localStorage.getItem('daaix-edit-' + id);
    if (overlay) {
      bodyEl.innerHTML = overlay;
      const badge = document.createElement('div');
      badge.className = 'edited-badge';
      badge.textContent = '✏️ ' + I18n.t('editedCopy');
      bodyEl.prepend(badge);
    } else {
      if (doc.summary) {
        const s = document.createElement('p');
        s.className = 'doc-summary';
        s.textContent = doc.summary[I18n.lang] || doc.summary.ar || doc.summary.en || '';
        bodyEl.appendChild(s);
      }

      if ((doc.articles || []).length) {
        doc.articles.forEach(a => {
          const aTitle = a.title ? (a.title[I18n.lang] || a.title.ar || a.title.en || '') : '';
          const card = document.createElement('div');
          card.className = 'article-card';
          card.innerHTML = `<div class="anum">${esc(a.num || '')}${aTitle ? ' — ' + esc(aTitle) : ''}</div><div>${esc(a.text || '')}</div>`;
          bodyEl.appendChild(card);
        });
      }

      if (doc.body) bodyEl.appendChild(renderMarkdown(doc.body));
    }

    this.buildToc();
    this.renderDocProps(doc);
    document.getElementById('editBanner').classList.add('hidden');
  },

  buildToc() {
    const toc = document.getElementById('tocItems');
    toc.innerHTML = '';
    document.querySelectorAll('#docBody h1, #docBody h2, #docBody h3, #docBody .anum').forEach((h, i) => {
      if (!h.id) h.id = 'toc-' + i;
      const link = document.createElement('div');
      link.className = 'toc-item' + (h.tagName === 'H1' ? ' lvl1' : h.tagName === 'H2' ? ' lvl2' : h.id.startsWith('toc-') ? ' art' : ' lvl3');
      link.textContent = h.textContent.slice(0, 60);
      link.onclick = () => h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toc.appendChild(link);
    });
    if (!toc.children.length) toc.innerHTML = `<p class="hint">—</p>`;
  },

  renderDocProps(doc) {
    const side = document.getElementById('docProps');
    side.innerHTML = '';

    const block = (titleText) => {
      const b = document.createElement('div');
      b.className = 'side-block';
      const h = document.createElement('h3');
      h.textContent = titleText;
      b.appendChild(h);
      return b;
    };
    const propRow = (label, value) => {
      const r = document.createElement('div');
      r.className = 'prop-row';
      r.innerHTML = `<span class="pl">${esc(label)}</span><span class="pv">${esc(value || '—')}</span>`;
      return r;
    };

    const pb = block(I18n.t('docProps'));
    pb.appendChild(propRow(I18n.t('issueTool'), doc.issueTool ? (doc.issueTool.tool || doc.issueTool.ar || doc.issueTool) : (doc.issuer ? (doc.issuer[I18n.lang] || doc.issuer.ar || doc.issuer.en) : '—')));
    pb.appendChild(propRow(I18n.t('issueToolDate'), doc.issueTool ? doc.issueTool.date : doc.date));
    pb.appendChild(propRow(I18n.t('issueToolNo'), doc.issueTool ? doc.issueTool.number : doc.number));
    const st = document.createElement('div');
    st.className = 'prop-row';
    st.innerHTML = `<span class="pl">${I18n.t('legislativeStatus')}</span><span class="pv status-text s-${doc.status || 'in_force'}">${I18n.t('status_' + (doc.status || 'in_force'))}</span>`;
    pb.appendChild(st);
    pb.appendChild(propRow(I18n.t('version'), doc.version));
    side.appendChild(pb);

    const versions = [...(doc.versionHistory || [])].sort((a, b) => b.version - a.version);
    if (versions.length) {
      const vb = block(I18n.t('versionRegister'));
      versions.forEach((v, i) => {
        const next = versions[i - 1];
        const item = document.createElement('div');
        item.className = 'ver-item';
        item.innerHTML = `
          <div class="v">${I18n.t('version')} ${v.version}</div>
          <div class="d">${I18n.t('fromTo')}: ${esc(v.date || '—')} ${next ? '→ ' + esc(next.date) : '→ ∞'}</div>
          <div class="c">${esc(v.change ? (v.change[I18n.lang] || v.change.ar || v.change.en || '') : '')}</div>
          ${v.by ? `<div class="d">${esc(v.by)}</div>` : ''}`;
        vb.appendChild(item);
      });
      const am = block(I18n.t('amendments'));
      versions.filter(v => v.version > 1).forEach(v => {
        const item = document.createElement('div');
        item.className = 'ver-item';
        item.innerHTML = `<div class="v">${esc(v.date || '')}</div><div class="c">${esc(v.change ? (v.change[I18n.lang] || v.change.ar || v.change.en || '') : '')}</div>${v.by ? `<div class="d">${esc(v.by)}</div>` : ''}`;
        am.appendChild(item);
      });
      side.appendChild(vb);
      if (versions.some(v => v.version > 1)) side.appendChild(am);
    }

    const { outgoing, incoming } = KB.relationsOf(doc.id);
    if (outgoing.length || incoming.length) {
      const rb = block(I18n.t('relations'));
      const addRel = (label, targetId, note) => {
        const item = document.createElement('div');
        item.className = 'rel-item';
        const target = KB.get(targetId);
        const tTitle = target ? (target.title[I18n.lang] || target.title.ar || target.title.en || targetId) : targetId;
        item.innerHTML = `<span class="rtype">${esc(label)}</span><span>${esc(tTitle)}</span>
          ${note ? `<span style="font-size:11px;color:var(--muted)">${esc(note[I18n.lang] || note.ar || note.en || '')}</span>` : ''}`;
        if (target) item.onclick = () => this.openDocument(targetId);
        rb.appendChild(item);
      };
      outgoing.forEach(r => addRel(I18n.t('rel_' + r.type), r.target, r.note));
      incoming.forEach(r => {
        const label = r.type === 'cites' ? I18n.t('citedIn') : I18n.t('rel_' + r.type);
        addRel(label, r.sourceDoc.id, r.note);
      });
      side.appendChild(rb);
    }

    const rulings = [...outgoing, ...incoming].filter(r =>
      (r.targetDoc && r.targetDoc.type === 'ruling') || (r.sourceDoc && r.sourceDoc.type === 'ruling'));
    if (rulings.length && doc.type !== 'ruling') {
      const rbb = block(I18n.t('relatedRulings'));
      rulings.forEach(r => {
        const d = r.targetDoc || r.sourceDoc;
        const item = document.createElement('div');
        item.className = 'rel-item';
        item.innerHTML = `<span>⚖️ ${esc(d.title[I18n.lang] || d.title.ar || d.title.en)}</span>`;
        item.onclick = () => this.openDocument(d.id);
        rbb.appendChild(item);
      });
      side.appendChild(rbb);
    }

    if ((doc.sources || []).length) {
      const sb = block(I18n.t('officialSources'));
      doc.sources.forEach(s => {
        const item = document.createElement('div');
        item.className = 'src-item';
        item.innerHTML = `<a href="${esc(s.url)}">${esc(s.title)}</a>`;
        item.querySelector('a').onclick = (e) => { e.preventDefault(); window.daaix.openExternal(s.url); };
        sb.appendChild(item);
      });
      side.appendChild(sb);
    }
  },

  /* ---------- local edit mode ---------- */
  toggleEdit() {
    const bodyEl = document.getElementById('docBody');
    const banner = document.getElementById('editBanner');
    this.editing = !this.editing;
    bodyEl.contentEditable = this.editing ? 'true' : 'false';
    document.getElementById('docPaper').classList.toggle('editing', this.editing);
    banner.classList.toggle('hidden', !this.editing);
    if (this.editing) bodyEl.focus();
  },

  async saveEdits() {
    const bodyEl = document.getElementById('docBody');
    bodyEl.querySelector('.edited-badge') && bodyEl.querySelector('.edited-badge').remove();
    localStorage.setItem('daaix-edit-' + this.currentDocId, bodyEl.innerHTML);
    this.toggleEdit();
    this.openDocument(this.currentDocId);
    this.toast(I18n.t('saveEdits') + ' ✓');
  },

  discardEdits() {
    localStorage.removeItem('daaix-edit-' + this.currentDocId);
    this.openDocument(this.currentDocId);
  }
};

window.addEventListener('DOMContentLoaded', () => App.boot());
