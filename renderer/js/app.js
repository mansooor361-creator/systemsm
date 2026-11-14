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
      html += `<div class="callout ${meta.cls}"><div class="co-title">${meta.icon} ${title || type.toUpperCase()}</div>${rest ? `<div class="co-body">${rest}</div>` : ''}</div>`;
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      const level = line.match(/^#+/)[0].length;
      const text = inline(line.replace(/^#+\s*/, ''));
      const anchor = 'h-' + html.length;
      html += `<h${level} id="${anchor}">${text}</h${level}>`;
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

};

/* ---------- main app ---------- */
const App = {
  settings: {},
  currentDocId: null,
  currentCat: 'all',
  editing: false,

  async boot() {
    this.settings = (await window.daaix.settingsGet()) || {};
    if (!this.settings.kbEnabled) this.settings.kbEnabled = {};
    if (!this.settings.toolEnabled) this.settings.toolEnabled = {};
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
    this.bindSettingsTabs();
    this.bindReaderTabs();
    this.bindLogin();
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
    this.renderKbPicker();
    this.renderToolRail();
    this.renderHomeToolCards();
    this.renderFeed();
    this.renderAccount();
    this.renderAiSettings();
    this.renderKbSettings();
    this.renderToolSettings();
    this.applyLangUi();
  },

  applyLangUi() {
    document.getElementById('btnLangFix') && (document.getElementById('btnLangFix').textContent = I18n.lang === 'ar' ? 'EN' : 'ع');
    const warn = document.getElementById('editWarningText');
    if (warn) warn.textContent = I18n.t('editWarning');
  },

  bindTopbar() {
    const modeBtn = document.getElementById('btnSearchMode');
    if (modeBtn) modeBtn.textContent = this.searchMode === 'text' ? '\ud83d\udd0d' : '\u2728';
    document.getElementById('btnRailHome').onclick = () => this.activateTab('home');
    document.getElementById('btnSearchMode').onclick = (e) => {
      e.stopPropagation();
      this.renderSearchModeMenu();
      document.getElementById('searchModeMenu').classList.toggle('hidden');
    };
    document.addEventListener('click', (e) => {
      ['kbPickerMenu', 'searchModeMenu', 'docChatPlusPopup'].forEach(id => {
        const menu = document.getElementById(id);
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) {
          menu.classList.add('hidden');
        }
      });
    });
    document.getElementById('btnKbPicker').onclick = (e) => {
      e.stopPropagation();
      document.getElementById('kbPickerMenu').classList.toggle('hidden');
    };
    document.getElementById('btnDrawer').onclick = () => this.openDrawer();
    document.getElementById('btnAgents').onclick = () => Agents.open(Agents.current);
    document.getElementById('btnTools').onclick = () => Tools.open(Tools.active || 'converter');
    document.getElementById('btnNotes').onclick = () => this.openTab({ kind: 'notes' });
    document.getElementById('siteLink').onclick = (e) => {
      e.preventDefault();
      window.daaix.openExternal('https://smartk-ai.com/');
    };
    document.getElementById('globalSearch').addEventListener('input', (e) => {
      this.search(e.target.value);
    });
  },

  bindDrawer() {
    document.getElementById('btnDrawerClose').onclick = () => this.closeDrawer();
    document.getElementById('drawerOverlay').onclick = () => this.closeDrawer();
    document.getElementById('siteLink').onclick = (e) => {
      e.preventDefault();
      window.daaix.openExternal('https://smartk-ai.com/');
    };
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
      this.openTab({ kind: 'settings' });
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
      login.onclick = () => this.openLogin();
      const reg = document.createElement('button');
      reg.className = 'danger';
      reg.textContent = I18n.t('register');
      reg.onclick = () => window.daaix.openExternal('https://smartk-ai.com/register');
      area.appendChild(login);
      area.appendChild(reg);
    }
  },

  /* ---------- login (built-in account + platform link) ---------- */
  openLogin() {
    document.getElementById('loginModal').classList.remove('hidden');
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginError').classList.add('hidden');
    const acc = this.settings.lastLogin || {};
    document.getElementById('loginUser').value = acc.email || '';
    document.getElementById('loginPass').value = acc.password || '';
  },

  closeLogin() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginOverlay').classList.add('hidden');
  },

  bindLogin() {
    document.getElementById('btnLoginClose').onclick = () => this.closeLogin();
    document.getElementById('loginOverlay').onclick = () => this.closeLogin();
    document.getElementById('btnLoginRegister').onclick = () => window.daaix.openExternal('https://smartk-ai.com/register');
    document.getElementById('btnLoginSubmit').onclick = async () => {
      const email = document.getElementById('loginUser').value.trim();
      const pass = document.getElementById('loginPass').value;
      const err = document.getElementById('loginError');
      if (email.toLowerCase() === 'mansooor361@gmail.com' && pass === '123456') {
        this.settings.account = { email };
        this.settings.lastLogin = { email, password: pass };
        await window.daaix.settingsSet({ account: this.settings.account });
        this.closeLogin();
        this.renderAccount();
        this.toast('✓ ' + I18n.t('loginSuccess'));
      } else {
        err.textContent = I18n.t('loginFailed');
        err.classList.remove('hidden');
      }
    };
  },

  /* ---------- v1.5: enabled KB/tool toggles + top KB picker ---------- */
  kbIsOn(id) { return (this.settings.kbEnabled || {})[id] !== false; },
  toolIsOn(id) { return (this.settings.toolEnabled || {})[id] !== false; },

  renderKbPicker() {
    const menu = document.getElementById('kbPickerMenu');
    menu.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'kb-picker-title';
    title.textContent = I18n.t('kbs');
    menu.appendChild(title);
    const all = document.createElement('button');
    all.className = 'kb-menu-item';
    all.textContent = '\ud83c\udf10 ' + I18n.t('all');
    all.onclick = () => {
      menu.classList.add('hidden');
      this.currentKbId = null;
      this.currentCat = 'all';
      this.activateTab('home');
    };
    menu.appendChild(all);
    KB.kbs.filter(kb => this.kbIsOn(kb.id)).forEach(kb => {
      const b = document.createElement('button');
      b.className = 'kb-menu-item';
      b.textContent = `${kb.icon || '\ud83d\udcda'} ${kb.name[I18n.lang] || kb.name.ar} (${(kb.documents || []).length})`;
      b.onclick = () => {
        menu.classList.add('hidden');
        this.currentKbId = kb.id;
        this.currentCat = 'all';
        this.activateTab('home');
        this.toast(`${kb.icon || '\ud83d\udcda'} ${kb.name[I18n.lang] || kb.name.ar}`);
      };
      menu.appendChild(b);
    });
  },

  KB_CLOUDS: [
    { id: 'gdrive', icon: '\ud83c\udf10', name: 'Google Drive', url: 'https://drive.google.com' },
    { id: 'onedrive', icon: '\u2601\ufe0f', name: 'OneDrive', url: 'https://onedrive.live.com' },
    { id: 'dropbox', icon: '\ud83d\udce6', name: 'Dropbox', url: 'https://www.dropbox.com' },
    { id: 'icloud', icon: '\ud83c\udf4f', name: 'iCloud Drive', url: 'https://www.icloud.com' },
    { id: 'box', icon: '\ud83d\uddc3\ufe0f', name: 'Box', url: 'https://www.box.com' },
    { id: 'pcloud', icon: '\ud83d\uddc4\ufe0f', name: 'pCloud', url: 'https://www.pcloud.com' },
    { id: 'mega', icon: '\ud83d\udd12', name: 'MEGA', url: 'https://mega.io' }
  ],

  renderCloudPanel() {
    const panel = document.getElementById('kbCloudPanel');
    if (!panel) return;
    panel.innerHTML = '';
    const title = document.createElement('p');
    title.className = 'hint';
    title.textContent = I18n.t('cloudTitle');
    panel.appendChild(title);
    this.KB_CLOUDS.forEach(c => {
      const row = document.createElement('div');
      row.className = 'cloud-row';
      row.innerHTML = `<span class="sr-icon mono">${c.icon}</span>
        <div class="sr-main"><div class="sr-name">${esc(c.name)}</div>
        <div class="sr-desc">${I18n.t('cloudNeedsAuth')}</div></div>
        <button class="ghost-btn">${I18n.t('cloudConnect')}</button>`;
      row.querySelector('button').onclick = () => {
        window.daaix.openExternal(c.url);
        this.toast(I18n.t('cloudNeedsAuth'));
      };
      panel.appendChild(row);
    });
    const direct = document.createElement('div');
    direct.className = 'cloud-row';
    direct.innerHTML = `<span class="sr-icon mono">\ud83d\udd17</span>
      <div class="sr-main"><div class="sr-name">${I18n.t('directUrl')}</div>
      <div class="sr-desc">${I18n.t('kbApiPh')}</div></div>`;
    panel.appendChild(direct);
  },

  bindKbProgress() {
    if (!window.daaix.onKbProgress) return;
    this._kbProgTimer = null;
    window.daaix.onKbProgress((d) => this.showKbProgress(d));
  },

  showKbProgress(d) {
    const bar = document.getElementById('kbProgress');
    if (!bar || !d) return;
    bar.classList.remove('hidden');
    const stageKey = d.stage === 'scan' ? 'progressScan' : d.stage === 'convert' ? 'progressConvert' : 'progressRead';
    document.getElementById('kbProgressStage').textContent = I18n.t(stageKey);
    document.getElementById('kbProgressFile').textContent = d.file || '';
    const fill = document.getElementById('kbProgressBarFill');
    const pctEl = document.getElementById('kbProgressPct');
    if (d.total) {
      const pct = Math.min(100, Math.round((d.done / d.total) * 100));
      fill.style.width = pct + '%';
      pctEl.textContent = pct + '%';
      if (d.done >= d.total) {
        clearTimeout(this._kbProgTimer);
        this._kbProgTimer = setTimeout(() => {
          bar.classList.add('hidden');
          this.toast(I18n.t('progressDone'));
        }, 900);
      }
    } else {
      fill.style.width = '30%';
      pctEl.textContent = '...';
    }
  },

  renderKbSettings() {
    const list = document.getElementById('kbSettingsList');
    if (!list) return;
    list.innerHTML = '';
    KB.kbs.forEach(kb => {
      const name = kb.name[I18n.lang] || kb.name.ar || kb.id;
      const src = kb.source === 'local' ? I18n.t('kbSourceFolder') : I18n.t('kbSourceApi');
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.innerHTML = `
        <span class="sr-icon">${kb.icon || '\ud83d\udcda'}</span>
        <div class="sr-main">
          <div class="sr-name">${esc(name)} <span class="cat-chip src">${esc(src)}</span></div>
          <div class="sr-desc">${(kb.documents || []).length} ${I18n.t('documentsPl')}</div>
        </div>
        ${kb.sourcePath ? `<button class="ghost-btn kb-rescan">${I18n.t('refreshKb')}</button>` : ''}
        <label class="switch"><input type="checkbox" ${this.kbIsOn(kb.id) ? 'checked' : ''} /><span class="sl"></span></label>`;
      row.querySelector('input').onchange = async (e) => {
        this.settings.kbEnabled[kb.id] = e.target.checked;
        await window.daaix.settingsSet({ kbEnabled: this.settings.kbEnabled });
        this.renderKbPicker();
        this.toast(`${e.target.checked ? I18n.t('toolOn') : I18n.t('toolOff')} \u2014 ${name}`);
      };
      if (kb.sourcePath) {
        row.querySelector('.kb-rescan').onclick = async () => {
          const res = await window.daaix.rescanFolder(kb.sourcePath, kb.id);
          if (res && res.ok) {
            res.kb.source = 'local';
            KB.addDownloaded([res.kb]);
            Retrieval.build();
            await window.daaix.kbSaveDownloaded(res.kb);
            this.renderAll();
            this.toast(`${I18n.t('imported')}: ${res.count}`);
          } else this.toast((res && res.error) || '\u2014');
        };
      }
      list.appendChild(row);
    });
  },

  renderToolSettings() {
    const list = document.getElementById('toolSettingsList');
    if (!list) return;
    const q = (document.getElementById('setToolSearch').value || '').trim().toLowerCase();
    list.innerHTML = '';
    Tools.list()
      .filter(t => !q || t.label.toLowerCase().includes(q) || (t.desc || '').toLowerCase().includes(q))
      .forEach(t => {
        const row = document.createElement('div');
        row.className = 'settings-row';
        row.innerHTML = `
          <span class="sr-icon">${t.icon}</span>
          <div class="sr-main">
            <div class="sr-name">${esc(t.label)} <span class="cat-chip ${t.cat}">${esc(I18n.t('cat_' + t.cat))}</span></div>
            <div class="sr-desc">${esc(t.desc || '')}</div>
          </div>
          <label class="switch"><input type="checkbox" ${this.toolIsOn(t.id) ? 'checked' : ''} /><span class="sl"></span></label>`;
        row.querySelector('input').onchange = async (e) => {
          this.settings.toolEnabled[t.id] = e.target.checked;
          await window.daaix.settingsSet({ toolEnabled: this.settings.toolEnabled });
          Tools.renderMenu();
          this.renderToolRail();
          this.renderHomeToolCards();
          this.toast(`${e.target.checked ? I18n.t('toolOn') : I18n.t('toolOff')} \u2014 ${t.label}`);
        };
        list.appendChild(row);
      });
    if (!list.children.length) list.innerHTML = `<p class="hint">\u2014</p>`;
  },

  renderToolRail() {
    const wrap = document.getElementById('toolRail');
    if (!wrap) return;
    wrap.innerHTML = '';
    Tools.list().filter(t => this.toolIsOn(t.id)).forEach(t => {
      const b = document.createElement('button');
      b.className = 'rail-btn tool-rail-btn mono';
      b.title = t.label;
      b.textContent = t.icon;
      b.onclick = () => Tools.open(t.id);
      wrap.appendChild(b);
    });
  },

  renderHomeToolCards() {
    const title = document.getElementById('homeToolsTitle');
    const wrap = document.getElementById('homeToolCards');
    if (!wrap) return;
    const enabled = Tools.list().filter(t => this.toolIsOn(t.id));
    title.classList.toggle('hidden', !enabled.length);
    wrap.innerHTML = '';
    enabled.forEach(t => {
      const card = document.createElement('div');
      card.className = 'quick-card';
      card.innerHTML = `<div class="qc-icon">${t.icon}</div><div class="qc-label">${esc(t.label)}</div><div class="qc-desc">${esc(t.desc || '')}</div>`;
      card.onclick = () => Tools.open(t.id);
      wrap.appendChild(card);
    });
  },

  bindSettingsTabs() {
    document.querySelectorAll('#setTabs .set-tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#setTabs .set-tab').forEach(b => b.classList.toggle('active', b === btn));
        ['settings', 'kbs', 'tools', 'ai'].forEach(p =>
          document.getElementById('setPane' + p.charAt(0).toUpperCase() + p.slice(1)).classList.toggle('hidden', p !== btn.dataset.set));
      };
    });
  },

  async doImportFolder(statusEl) {
    statusEl.textContent = '...';
    const res = await window.daaix.importFolder();
    if (!res || !res.ok) { statusEl.textContent = (res && res.error) || '\u2014'; return; }
    res.kb.source = 'local';
    KB.addDownloaded([res.kb]);
    Retrieval.build();
    await window.daaix.kbSaveDownloaded(res.kb);
    this.renderAll();
    statusEl.textContent = `${I18n.t('imported')}: ${res.count}`;
    this.toast(`${I18n.t('imported')}: ${res.count}`);
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
    document.getElementById('docChatExpand').onclick = () => {
      const expanded = document.body.classList.toggle('chat-expanded');
      document.getElementById('docChatExpand').textContent = expanded ? '\u2923' : '\u2922';
    };
    document.getElementById('btnFeedView').onclick = () => this.toggleFeedView();
    document.getElementById('btnNewNote').onclick = () => Notes.create();
    document.getElementById('btnSaveNote').onclick = () => Notes.save();
    document.getElementById('btnDeleteNote').onclick = () => Notes.remove();

    document.getElementById('btnEditDoc').onclick = () => this.toggleEdit();
    document.getElementById('btnSaveEdits').onclick = () => this.saveEdits();
    document.getElementById('btnDiscardEdits').onclick = () => this.discardEdits();

    document.getElementById('btnImportFolder').onclick = () => this.doImportFolder(document.getElementById('importStatus'));
    document.getElementById('btnKbSourceFolder').onclick = () => this.doImportFolder(document.getElementById('kbAddStatus'));
    document.getElementById('btnKbSourceCloud').onclick = () => {
      document.getElementById('kbPlatformPanel').classList.add('hidden');
      const panel = document.getElementById('kbCloudPanel');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) this.renderCloudPanel();
    };
    document.getElementById('btnKbSourcePlatform').onclick = () => {
      document.getElementById('kbCloudPanel').classList.add('hidden');
      document.getElementById('kbPlatformPanel').classList.toggle('hidden');
    };
    this.bindKbProgress();

    document.getElementById('btnKbAddApi').onclick = async () => {
      const status = document.getElementById('kbAddStatus');
      const url = document.getElementById('setKbApiUrl').value.trim();
      if (!url) { status.textContent = '—'; return; }
      status.textContent = '...';
      const keyEl = document.getElementById('setKbApiKey');
      const key = keyEl ? keyEl.value.trim() : '';
      this.settings.platform = { url, key };
      await window.daaix.settingsSet({ platform: { url, key } });
      const res = await window.daaix.kbFetchRemote(url);
      if (!res || !res.ok) { status.textContent = (res && res.error) || 'error'; return; }
      const data = res.data;
      const kbs = Array.isArray(data) ? data : (data.kbs || [data]);
      for (const kb of kbs) {
        kb.source = 'api';
        KB.addDownloaded([kb]);
        await window.daaix.kbSaveDownloaded(kb);
      }
      Retrieval.build();
      this.renderAll();
      status.textContent = `${I18n.t('imported')}: ${kbs.length}`;
      this.toast(`${I18n.t('imported')}: ${kbs.length}`);
    };
    document.getElementById('setToolSearch').addEventListener('input', () => this.renderToolSettings());

    document.getElementById('btnSaveSettings').onclick = () => this.saveSettingsForm();
    document.getElementById('btnAiSave').onclick = () => this.saveSettingsForm();
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

  saveSettingsForm() {
    return (async () => {
      const patch = {
        language: document.getElementById('setLang').value,
        theme: document.getElementById('setTheme').value,
        updateUrl: document.getElementById('setUpdateUrl').value,
        llm: {
          baseUrl: document.getElementById('setLlmUrl').value.trim(),
          apiKey: document.getElementById('setLlmKey').value.trim(),
          model: document.getElementById('setLlmModel').value.trim()
        },
        connectors: this.readConnectors(),
        providers: this.readProviders(),
        activeProvider: (document.querySelector('input[name=activeProvider]:checked') || {}).value || ''
      };
      this.settings = await window.daaix.settingsSet(patch);
      window.daaixSettings = this.settings;
      this.toast(I18n.t('save') + ' ✓');
    })();
  },

  agentIsOn(id) {
    return (this.settings.agentsEnabled || {})[id] !== false;
  },

  renderProviderList() {
    const list = document.getElementById('providerList');
    if (!list) return;
    if (!this.settings.providers || !this.settings.providers.length) {
      this.settings.providers = AI_PROVIDERS.map(p => ({
        id: p.id, name: p.name, baseUrl: p.baseUrl || '', model: p.model || '', apiKey: '', enabled: true
      }));
    }
    const active = this.settings.activeProvider || '';
    list.innerHTML = '';
    this.settings.providers.forEach((p) => {
      const name = p.name[I18n.lang] || p.name.ar;
      const row = document.createElement('div');
      row.className = 'settings-row provider-row';
      row.innerHTML = `
        <label class="check-item prov-active" title="${esc(I18n.t('activeProvider'))}"><input type="radio" name="activeProvider" value="${esc(p.id)}" ${active === p.id ? 'checked' : ''} /></label>
        <div class="sr-main">
          <div class="sr-name">${esc(name)}</div>
          <input type="url" data-p="baseUrl" placeholder="https://api.example.com/v1" value="${esc(p.baseUrl || '')}" />
          <input type="password" data-p="apiKey" placeholder="${esc(I18n.t('apiKey'))}" value="${esc(p.apiKey || '')}" autocomplete="off" />
          <input type="text" data-p="model" placeholder="${esc(I18n.t('model'))}" value="${esc(p.model || '')}" />
        </div>
        <label class="switch"><input type="checkbox" data-p="enabled" ${p.enabled !== false ? 'checked' : ''} /><span class="sl"></span></label>`;
      list.appendChild(row);
    });
  },

  readProviders() {
    const list = document.getElementById('providerList');
    if (!list || !this.settings.providers) return this.settings.providers || [];
    const rows = [...list.querySelectorAll('.provider-row')];
    return this.settings.providers.map((p, idx) => {
      const row = rows[idx];
      if (!row) return p;
      return {
        ...p,
        baseUrl: row.querySelector('[data-p=baseUrl]').value.trim(),
        apiKey: row.querySelector('[data-p=apiKey]').value.trim(),
        model: row.querySelector('[data-p=model]').value.trim(),
        enabled: row.querySelector('[data-p=enabled]').checked
      };
    });
  },

  renderAiSettings() {
    this.renderProviderList();
    const agentList = document.getElementById('agentSettingsList');
    if (!agentList) return;
    agentList.innerHTML = '';
    Agents.list().forEach(a => {
      const name = a.label.en || a.label.ar;
      const desc = a.desc[I18n.lang] || a.desc.ar;
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.innerHTML = `
        <span class="sr-icon">${a.icon}</span>
        <div class="sr-main">
          <div class="sr-name">${esc(name)}</div>
          <div class="sr-desc">${esc(desc)}</div>
        </div>
        <label class="switch"><input type="checkbox" ${this.agentIsOn(a.id) ? 'checked' : ''} /><span class="sl"></span></label>`;
      row.querySelector('input').onchange = async (e) => {
        this.settings.agentsEnabled = this.settings.agentsEnabled || {};
        this.settings.agentsEnabled[a.id] = e.target.checked;
        await window.daaix.settingsSet({ agentsEnabled: this.settings.agentsEnabled });
        Agents.renderMenu();
        this.toast(`${e.target.checked ? I18n.t('agentOn') : I18n.t('agentOff')} — ${name}`);
      };
      agentList.appendChild(row);
    });

    const cmdList = document.getElementById('commandList');
    cmdList.innerHTML = '';
    Agents.commands().forEach(c => {
      const label = c.label[I18n.lang] || c.label.ar;
      const prompt = c.prompt[I18n.lang] || c.prompt.ar;
      const row = document.createElement('div');
      row.className = 'cmd-item';
      row.innerHTML = `
        <span class="cmd-icon">${c.icon}</span>
        <div class="cmd-main">
          <div class="cmd-name"><span class="cmd-slash">/</span> ${esc(label)}</div>
          <div class="cmd-desc">${esc(prompt)}</div>
        </div>
        <button class="ghost-btn cmd-run">${I18n.t('run')}</button>`;
      row.querySelector('.cmd-run').onclick = () => {
        Agents.open('consultant');
        document.getElementById('agentInput').value = prompt;
        document.getElementById('agentInput').focus();
      };
      cmdList.appendChild(row);
    });

    const skillList = document.getElementById('skillList');
    skillList.innerHTML = '';
    Agents.skills().forEach(sk => {
      const label = sk.label[I18n.lang] || sk.label.ar;
      const desc = sk.desc[I18n.lang] || sk.desc.ar;
      const prompt = sk.prompt[I18n.lang] || sk.prompt.ar;
      const row = document.createElement('div');
      row.className = 'cmd-item';
      row.innerHTML = `
        <span class="cmd-icon">${sk.icon}</span>
        <div class="cmd-main">
          <div class="cmd-name">${esc(label)}</div>
          <div class="cmd-desc">${esc(desc)}</div>
        </div>
        <button class="ghost-btn cmd-run">${I18n.t('run')}</button>`;
      row.querySelector('.cmd-run').onclick = () => {
        Agents.open(sk.agent);
        document.getElementById('agentInput').value = prompt;
        document.getElementById('agentInput').focus();
      };
      skillList.appendChild(row);
    });
  },

  fillSettings() {
    document.getElementById('setLang').value = I18n.lang;
    document.getElementById('setTheme').value = this.settings.theme || 'dark';
    document.getElementById('setUpdateUrl').value = this.settings.updateUrl || '';
    const llm = this.settings.llm || {};
    document.getElementById('setLlmUrl').value = llm.baseUrl || '';
    document.getElementById('setLlmKey').value = llm.apiKey || '';
    document.getElementById('setLlmModel').value = llm.model || '';
    this.renderProviderList();
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
    ['home', 'doc', 'agents', 'tools', 'notes', 'settings'].forEach(v => {
      document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
    });
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.add('hidden'), 2600);
  },

  /* ---------- home ---------- */
  feedView: 'grid',

  applyFeedView() {
    const feed = document.getElementById('updatesFeed');
    const btn = document.getElementById('btnFeedView');
    if (!feed || !btn) return;
    feed.classList.toggle('feed-list', this.feedView === 'list');
    btn.textContent = this.feedView === 'list' ? '\u25a6' : '\u2630';
    btn.title = I18n.t(this.feedView === 'list' ? 'feedGridView' : 'feedListView');
  },

  toggleFeedView() {
    this.feedView = this.feedView === 'list' ? 'grid' : 'list';
    try { localStorage.setItem('daaix-feedView', this.feedView); } catch (e) { /* ignore */ }
    this.applyFeedView();
  },

  renderFeed() {
    const feed = document.getElementById('updatesFeed');
    feed.innerHTML = '';
    this.applyFeedView();
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


  /* ---------- search: textual + semantic modes, detailed result cards ---------- */
  searchMode: 'text',
  searchCat: 'all',

  setSearchMode(mode) {
    this.searchMode = mode;
    const btn = document.getElementById('btnSearchMode');
    if (btn) btn.textContent = mode === 'text' ? '\ud83d\udd0d' : '\u2728';
    document.getElementById('searchModeMenu').classList.add('hidden');
    const q = document.getElementById('globalSearch').value;
    if (q && q.trim().length >= 2) this.search(q);
  },

  renderSearchModeMenu() {
    const menu = document.getElementById('searchModeMenu');
    menu.innerHTML = '';
    [
      ['text', '\ud83d\udd0d', 'searchTextTitle'],
      ['semantic', '\u2728', 'searchSemanticTitle']
    ].forEach(([m, icon, key]) => {
      const b = document.createElement('button');
      b.className = 'kb-menu-item' + (this.searchMode === m ? ' active-mode' : '');
      b.textContent = `${icon} ${I18n.t(key)}${this.searchMode === m ? ' \u2713' : ''}`;
      b.onclick = () => this.setSearchMode(m);
      menu.appendChild(b);
    });
  },

  search(q) {
    const box = document.getElementById('searchResults');
    const feed = document.getElementById('updatesFeed');
    const feedHead = document.getElementById('feedHead');
    const toolsTitle = document.getElementById('homeToolsTitle');
    const toolCards = document.getElementById('homeToolCards');
    const query = (q || '').trim();
    if (query !== this._lastQuery) { this.searchCat = 'all'; this._lastQuery = query; }
    this.activateTab('home');
    const active = query.length >= 2;
    feed.classList.toggle('hidden', !!active);
    if (feedHead) feedHead.classList.toggle('hidden', !!active);
    const toolsOn = Tools.list().some(t => this.toolIsOn(t.id));
    toolsTitle.classList.toggle('hidden', !!active || !toolsOn);
    toolCards.classList.toggle('hidden', !!active);
    box.innerHTML = '';
    if (!active) return;
    const all = this.searchMode === 'semantic' ? KB.searchSemantic(query, 60) : KB.search(query, 60);
    const results = this.searchCat === 'all' ? all : all.filter(r => r.doc.type === this.searchCat);

    const kbName = this.currentKbId && KB.kbs.find(k => k.id === this.currentKbId)
      ? KB.kbs.find(k => k.id === this.currentKbId).name[I18n.lang] || KB.kbs.find(k => k.id === this.currentKbId).name.ar
      : I18n.t('chatAll');

    const head = document.createElement('div');
    head.className = 'sr-head';
    const cats = [['all', 'catAll'], ['law', 'type_law_pl'], ['regulation', 'type_regulation_pl'],
      ['decision', 'type_decision_pl'], ['agreement', 'type_agreement_pl'],
      ['ruling', 'type_ruling_pl'], ['principle', 'type_principle_pl'], ['circular', 'type_circular_pl']];
    head.innerHTML = `
      <div class="sr-kbname">📚 ${esc(kbName)}</div>
      <div class="sr-cats">${cats.map(([c, key]) =>
        `<button class="sr-cat ${this.searchCat === c ? 'active' : ''}" data-cat="${c}">${I18n.t(key)}</button>`).join('')}</div>
      <div class="sr-count">${results.length} ${I18n.t('resultsCount')}</div>`;
    head.querySelectorAll('.sr-cat').forEach(b => {
      b.onclick = () => { this.searchCat = b.dataset.cat; this.search(q); };
    });
    box.appendChild(head);

    if (!results.length) {
      box.innerHTML += `<p class="hint" style="text-align:center;padding:20px">${I18n.t('noResults')}</p>`;
      return;
    }
    results.forEach(r => {
      const doc = r.doc;
      const title = doc.title[I18n.lang] || doc.title.ar || doc.title.en;
      const issueTool = doc.issueTool
        ? (doc.issueTool.tool || doc.issueTool.ar || doc.issueTool)
        : (doc.issuer ? (doc.issuer[I18n.lang] || doc.issuer.ar || doc.issuer.en) : '—');
      const item = document.createElement('div');
      item.className = 'sr-item';
      item.innerHTML = `
        <div class="sr-top"><div class="t">${esc(title)}</div><span class="chip type t-${doc.type}">${I18n.docTypeName(doc.type)}</span></div>
        <a class="sr-open" href="#">${I18n.t('viewDetails')} ←</a>
        <div class="sr-props">
          <div><span>${I18n.t('docType')}:</span> ${I18n.docTypeName(doc.type)}</div>
          <div><span>${I18n.t('issueTool')}:</span> ${esc(issueTool)}</div>
          <div><span>${I18n.t('docNumber')}:</span> ${esc(doc.issueTool ? doc.issueTool.number : (doc.number || '—'))}</div>
          <div><span>${I18n.t('issueToolDate')}:</span> ${esc(doc.issueTool ? doc.issueTool.date : (doc.date || '—'))}</div>
          <div><span>${I18n.t('legislativeStatus')}:</span> ${I18n.t('status_' + (doc.status || 'in_force'))}</div>
        </div>`;
      const open = () => { document.getElementById('globalSearch').value = ''; this.search(''); this.openDocument(doc.id); };
      item.querySelector('.sr-open').onclick = (e) => { e.preventDefault(); open(); };
      item.onclick = (e) => { if (e.target.tagName !== 'A') open(); };
      box.appendChild(item);
    });
  },

  /* ---------- document reader (tabbed: TOC | center tabs | right tabs) ---------- */
  bindReaderTabs() {
    document.querySelectorAll('#centerTabs .ctab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#centerTabs .ctab').forEach(b => b.classList.toggle('active', b === btn));
        ['props', 'original', 'pub'].forEach(t =>
          document.getElementById('pane' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('hidden', t !== btn.dataset.tab));
      };
    });
    document.querySelectorAll('#rightTabs .rtab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#rightTabs .rtab').forEach(b => b.classList.toggle('active', b === btn));
        ['amend', 'rulings', 'relations', 'chat'].forEach(t =>
          document.getElementById('rpane' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('hidden', t !== btn.dataset.tab));
      };
    });
    document.querySelectorAll('.sub-tabs .stab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.sub-tabs .stab').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('rpVersions').classList.toggle('hidden', btn.dataset.sub !== 'versions');
        document.getElementById('rpAmends').classList.toggle('hidden', btn.dataset.sub !== 'amends');
      };
    });
    document.getElementById('btnTocToggle').onclick = () => {
      const toc = document.getElementById('docToc');
      const hidden = toc.classList.toggle('collapsed');
      document.getElementById('btnTocToggle').textContent = hidden ? '❯' : '❮';
    };
    document.getElementById('docChatSend').onclick = () => this.sendDocChat();
    document.getElementById('docChatPlus').onclick = () => {
      const pop = document.getElementById('docChatPlusPopup');
      if (pop.classList.contains('hidden')) this.renderDocChatPlus(pop);
      else pop.classList.add('hidden');
    };
    document.getElementById('docChatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendDocChat(); }
    });
  },

  async sendDocChat() {
    const input = document.getElementById('docChatInput');
    const q = input.value.trim();
    if (!q || !this.currentDocId) return;
    input.value = '';
    const log = document.getElementById('docChatLog');
    const qEl = document.createElement('div');
    qEl.className = 'chat-q';
    qEl.textContent = q;
    log.appendChild(qEl);
    const ids = Retrieval.scopeDocIds(this.currentDocId, 1) || new Set();
    (this.docChatScope || []).forEach(c => {
      if (c.type === 'doc') ids.add(c.id);
      else {
        const kb = KB.kbs.find(k => k.id === c.id);
        (kb.documents || []).forEach(d => ids.add(d.id));
      }
    });
    const res = await Chat.answer(q, { scopeDocIds: ids });
    const aEl = document.createElement('div');
    aEl.className = 'chat-a';
    if (!res.passages || !res.passages.length) {
      aEl.appendChild(renderMarkdown(`> [!WARNING]\n> ${res.answer}`));
    } else {
      aEl.appendChild(renderMarkdown(res.answer));
    }
    if (res.passages && res.passages.length) {
      const cites = document.createElement('div');
      cites.className = 'chat-cites';
      res.passages.forEach(p => {
        const a = document.createElement('a');
        a.textContent = p.docTitle + (p.articleNum ? ' (' + p.articleNum + ')' : '');
        a.onclick = () => this.openDocument(p.docId);
        cites.appendChild(a);
      });
      aEl.appendChild(cites);
    }
    log.appendChild(aEl);
    log.scrollTop = log.scrollHeight;
  },

  renderDocChatPlus(popup) {
    popup.innerHTML = '';
    const add = (item) => {
      const b = document.createElement('button');
      b.className = 'ctx-item';
      b.innerHTML = `<span>${esc(item.label)}</span><span class="ctx-sub">${esc(item.sub)}</span>`;
      b.onmousedown = (e) => {
        e.preventDefault();
        if (!this.docChatScope.some(c => c.type === item.type && c.id === item.id)) this.docChatScope.push(item);
        popup.classList.add('hidden');
        this.renderDocChatChips();
      };
      popup.appendChild(b);
    };
    KB.kbs.forEach(kb => {
      const name = kb.name[I18n.lang] || kb.name.ar;
      add({ type: 'kb', id: kb.id, label: `${kb.icon || '📚'} ${name}`, sub: I18n.t('ctxKb') });
    });
    KB.index.forEach(e => {
      const name = e.doc.title[I18n.lang] || e.doc.title.ar || e.doc.title.en;
      add({ type: 'doc', id: e.doc.id, label: `📄 ${name}`, sub: I18n.docTypeName(e.doc.type) });
    });
    popup.classList.toggle('hidden', !KB.kbs.length && !KB.index.length);
  },

  renderDocChatChips() {
    const chips = document.getElementById('docChatChips');
    if (!chips) return;
    chips.innerHTML = '';
    (this.docChatScope || []).forEach((c, i) => {
      const chip = document.createElement('span');
      chip.className = 'ctx-chip';
      chip.textContent = c.label;
      const x = document.createElement('button');
      x.className = 'ctx-chip-x';
      x.textContent = '\u00d7';
      x.onclick = () => { this.docChatScope.splice(i, 1); this.renderDocChatChips(); };
      chip.appendChild(x);
      chips.appendChild(chip);
    });
  },

  /* ---------- browser-style tabs ---------- */
  tabs: [{ id: 'home', kind: 'home' }],
  activeTab: 'home',
  _tabSeq: 0,
  docChatScope: [],

  tabLabel(t) {
    if (t.kind === 'home') return I18n.t('home');
    if (t.kind === 'doc') {
      const d = KB.get(t.docId);
      return d ? (d.title[I18n.lang] || d.title.ar || d.title.en) : '\u2014';
    }
    if (t.kind === 'agents') return I18n.t('aiAssistantName');
    if (t.kind === 'tools') {
      const tl = Tools.list().find(x => x.id === t.toolId);
      return tl ? tl.label : I18n.t('tools');
    }
    if (t.kind === 'notes') return I18n.t('notes');
    return I18n.t('settings');
  },

  openTab(t) {
    const existing = this.tabs.find(x => x.kind === t.kind && x.docId === t.docId && x.toolId === t.toolId);
    if (existing) return this.activateTab(existing.id);
    if (this.tabs.length >= 10) { this.toast(I18n.t('tabsMax')); return; }
    t.id = 'tab-' + (++this._tabSeq);
    this.tabs.push(t);
    this.activateTab(t.id);
  },

  closeTab(id) {
    if (id === 'home') return;
    const idx = this.tabs.findIndex(x => x.id === id);
    if (idx < 0) return;
    this.tabs.splice(idx, 1);
    if (this.activeTab === id) this.activateTab(this.tabs[Math.min(idx, this.tabs.length - 1)].id);
    else this.renderTabBar();
  },

  activateTab(id) {
    const t = this.tabs.find(x => x.id === id);
    if (!t) return;
    this.activeTab = id;
    this.renderTabBar();
    if (t.kind === 'home') this.showView('home');
    else if (t.kind === 'doc') this.renderDocument(t.docId);
    else if (t.kind === 'agents') { this.showView('agents'); Agents.render(); }
    else if (t.kind === 'tools') { this.showView('tools'); Tools.active = t.toolId; Tools.renderMenu(); Tools.render(t.toolId); }
    else if (t.kind === 'notes') { this.showView('notes'); Notes.refresh(); }
    else if (t.kind === 'settings') this.showView('settings');
  },

  renderTabBar() {
    const bar = document.getElementById('tabBar');
    if (!bar) return;
    bar.classList.toggle('hidden', this.tabs.length <= 1);
    bar.innerHTML = '';
    this.tabs.forEach(t => {
      const el = document.createElement('div');
      el.className = 'app-tab' + (t.id === this.activeTab ? ' active' : '');
      const span = document.createElement('span');
      span.className = 'tab-title';
      span.textContent = this.tabLabel(t);
      el.appendChild(span);
      if (t.id !== 'home') {
        const x = document.createElement('button');
        x.className = 'tab-close';
        x.textContent = '\u00d7';
        x.onclick = (e) => { e.stopPropagation(); this.closeTab(t.id); };
        el.appendChild(x);
      }
      el.onclick = () => this.activateTab(t.id);
      bar.appendChild(el);
    });
  },

  openDocument(id) {
    this.openTab({ kind: 'doc', docId: id });
  },

  renderDocument(id) {
    const doc = KB.get(id);
    if (!doc) return;
    this.currentDocId = id;
    this.editing = false;
    this.docChatScope = [];
    const chips = document.getElementById('docChatChips');
    if (chips) chips.innerHTML = '';
    this.showView('doc');

    const title = doc.title[I18n.lang] || doc.title.ar || doc.title.en;
    const header = document.getElementById('docHeader');
    const infoRow = (label, value) =>
      `<div class="info-item"><span class="il">${esc(label)}</span><span class="iv">${esc(value || '—')}</span></div>`;
    header.innerHTML = `
      <h1>${esc(title)}</h1>
      <div class="doc-chips">
        <span class="chip type">${I18n.docTypeName(doc.type)}</span>
        <span class="chip status">${I18n.t('status_' + (doc.status || 'in_force'))}</span>
      </div>
      <div class="doc-info">
        ${infoRow(I18n.t('docName'), title)}
        ${infoRow(I18n.t('docType'), I18n.docTypeName(doc.type))}
        ${infoRow(I18n.t('issueToolNo'), doc.issueTool ? doc.issueTool.number : doc.number)}
        ${infoRow(I18n.t('legislativeStatus'), I18n.t('status_' + (doc.status || 'in_force')))}
        ${infoRow(I18n.t('issueTool'), doc.issueTool ? (doc.issueTool.tool || doc.issueTool.ar || doc.issueTool) : (doc.issuer ? (doc.issuer[I18n.lang] || doc.issuer.ar || doc.issuer.en) : '—'))}
        ${infoRow(I18n.t('issueToolDate'), doc.issueTool ? doc.issueTool.date : doc.date)}
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
      this.fillDocContent(bodyEl, doc);
    }

    this.renderOriginal(doc);
    this.renderPublication(doc);
    this.renderRightAmend(doc);
    this.renderRightRulings(doc);
    this.renderRightRelations(doc);
    document.getElementById('docChatLog').innerHTML = '';

    this.buildToc();
    document.getElementById('editBanner').classList.add('hidden');
  },

  fillDocContent(bodyEl, doc) {
    if (doc.summary) {
      const s = document.createElement('p');
      s.className = 'doc-summary';
      s.textContent = doc.summary[I18n.lang] || doc.summary.ar || doc.summary.en || '';
      bodyEl.appendChild(s);
    }
    const amends = doc.articleAmendments || [];
    if ((doc.articles || []).length) {
      doc.articles.forEach(a => {
        const aTitle = a.title ? (a.title[I18n.lang] || a.title.ar || a.title.en || '') : '';
        const card = document.createElement('div');
        card.className = 'article-card';
        card.innerHTML = `<div class="anum">${esc(a.num || '')}${aTitle ? ' — ' + esc(aTitle) : ''}</div><div>${esc(a.text || '')}</div>`;
        bodyEl.appendChild(card);
        amends.filter(m => String(m.article) === String(a.num)).forEach(m => {
          const note = document.createElement('div');
          note.className = 'article-amend';
          note.textContent = `⟳ ${I18n.t('articleAmendNote')} — ${esc(m.date)} ${I18n.t('amendedBy')} ${esc(m.by)}: ${esc(m.note ? (m.note[I18n.lang] || m.note.ar || '') : '')}`;
          card.appendChild(note);
        });
      });
    }
    if (doc.body) bodyEl.appendChild(renderMarkdown(doc.body));
  },

  renderOriginal(doc) {
    const wrap = document.getElementById('docOriginal');
    wrap.innerHTML = '';
    document.getElementById('originalNote').textContent = I18n.t('originalPdfNote');
    const pdfUrl = doc.originalPdf || ((doc.sources || []).find(s => /\.pdf(\?|$)/i.test(s.url)) || {}).url;
    if (pdfUrl) {
      const frame = document.createElement('iframe');
      frame.className = 'pdf-frame';
      frame.src = pdfUrl;
      wrap.appendChild(frame);
      return;
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = I18n.t('noOriginalPdf');
    wrap.appendChild(hint);
    const src = (doc.sources || [])[0];
    if (src) {
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = I18n.t('openOfficialSource');
      b.onclick = () => window.daaix.openExternal(src.url);
      wrap.appendChild(b);
    }
  },

  renderPublication(doc) {
    const wrap = document.getElementById('docPublication');
    wrap.innerHTML = '';
    if (!doc.publication && !(doc.sources || []).length) {
      wrap.innerHTML = `<p class="hint">—</p>`;
      return;
    }
    const row = (label, value) => {
      const r = document.createElement('div');
      r.className = 'prop-row';
      r.innerHTML = `<span class="pl">${esc(label)}</span><span class="pv">${esc(value || '—')}</span>`;
      return r;
    };
    if (doc.publication) {
      const p = doc.publication;
      const block = document.createElement('div');
      block.className = 'side-block';
      const h = document.createElement('h3');
      h.textContent = I18n.t('tabPublication');
      block.appendChild(h);
      block.appendChild(row(I18n.t('publisher'), p.publisher ? (p.publisher[I18n.lang] || p.publisher.ar) : ''));
      block.appendChild(row(I18n.t('refNumber'), p.number));
      block.appendChild(row(I18n.t('refIssue'), p.issue));
      block.appendChild(row(I18n.t('refDate'), p.date));
      (p.links || []).forEach(l => {
        const item = document.createElement('div');
        item.className = 'src-item';
        item.innerHTML = `<a href="${esc(l.url)}">${esc(l.name)} ←</a>`;
        item.querySelector('a').onclick = (e) => { e.preventDefault(); window.daaix.openExternal(l.url); };
        block.appendChild(item);
      });
      wrap.appendChild(block);
    }
    if ((doc.sources || []).length) {
      const sb = document.createElement('div');
      sb.className = 'side-block';
      const h = document.createElement('h3');
      h.textContent = I18n.t('officialSources');
      sb.appendChild(h);
      doc.sources.forEach(s => {
        const item = document.createElement('div');
        item.className = 'src-item';
        item.innerHTML = `<a href="${esc(s.url)}">${esc(s.title)} ←</a>`;
        item.querySelector('a').onclick = (e) => { e.preventDefault(); window.daaix.openExternal(s.url); };
        sb.appendChild(item);
      });
      wrap.appendChild(sb);
    }
  },

  renderRightAmend(doc) {
    const versions = [...(doc.versionHistory || [])].sort((a, b) => b.version - a.version);
    const vWrap = document.getElementById('rpVersions');
    vWrap.innerHTML = '';
    versions.forEach((v, i) => {
      const next = versions[i - 1];
      const item = document.createElement('div');
      item.className = 'ver-item';
      item.innerHTML = `
        <div class="v">${I18n.t('version')} ${v.version}</div>
        <div class="d">${I18n.t('fromTo')}: ${esc(v.date || '—')} ${next ? '→ ' + esc(next.date) : '→ ∞'}</div>
        <div class="c">${esc(v.change ? (v.change[I18n.lang] || v.change.ar || v.change.en || '') : '')}</div>
        ${v.by ? `<div class="d">${esc(v.by)}</div>` : ''}`;
      vWrap.appendChild(item);
    });
    if (!versions.length) vWrap.innerHTML = `<p class="hint">—</p>`;

    const aWrap = document.getElementById('rpAmends');
    aWrap.innerHTML = '';
    const amends = versions.filter(v => v.version > 1);
    (doc.articleAmendments || []).forEach(m => {
      const item = document.createElement('div');
      item.className = 'ver-item';
      item.innerHTML = `<div class="v">${esc(m.date || '')} — ${I18n.t('articleAmendNote')} (${esc(m.article)})</div>
        <div class="c">${esc(m.note ? (m.note[I18n.lang] || m.note.ar || '') : '')}</div>
        <div class="d">${I18n.t('amendedBy')} ${esc(m.by)}</div>`;
      aWrap.appendChild(item);
    });
    amends.forEach(v => {
      const item = document.createElement('div');
      item.className = 'ver-item';
      item.innerHTML = `<div class="v">${esc(v.date || '')}</div>
        <div class="c">${esc(v.change ? (v.change[I18n.lang] || v.change.ar || v.change.en || '') : '')}</div>
        ${v.by ? `<div class="d">${I18n.t('amendedBy')} ${esc(v.by)}</div>` : ''}`;
      aWrap.appendChild(item);
    });
    if (!aWrap.children.length) aWrap.innerHTML = `<p class="hint">—</p>`;
  },

  renderRightRulings(doc) {
    const wrap = document.getElementById('rpaneRulings');
    wrap.innerHTML = '';
    const { outgoing, incoming } = KB.relationsOf(doc.id);
    const rulings = [...outgoing, ...incoming].filter(r =>
      (r.targetDoc && r.targetDoc.type === 'ruling') || (r.sourceDoc && r.sourceDoc.type === 'ruling'));
    if (doc.type === 'ruling' || !rulings.length) {
      wrap.innerHTML = `<p class="hint">—</p>`;
      if (doc.type === 'ruling') {
        const info = document.createElement('div');
        info.className = 'ver-item';
        info.innerHTML = `<div class="v">${esc(doc.number || '')}</div><div class="d">${esc(doc.date || '')}</div>`;
        wrap.appendChild(info);
      }
      return;
    }
    rulings.forEach(r => {
      const d = r.targetDoc || r.sourceDoc;
      const item = document.createElement('div');
      item.className = 'rel-item';
      item.innerHTML = `<span>⚖️ ${esc(d.title[I18n.lang] || d.title.ar || d.title.en)}</span>
        <span class="rtype">${esc(d.number || '')} · ${esc(d.date || '')}</span>`;
      item.onclick = () => this.openDocument(d.id);
      wrap.appendChild(item);
    });
  },

  renderRightRelations(doc) {
    const wrap = document.getElementById('rpaneRelations');
    wrap.innerHTML = '';
    const { outgoing, incoming } = KB.relationsOf(doc.id);
    if (!outgoing.length && !incoming.length) {
      wrap.innerHTML = `<p class="hint">—</p>`;
      return;
    }
    const addRel = (label, targetId, note) => {
      const item = document.createElement('div');
      item.className = 'rel-item';
      const target = KB.get(targetId);
      const tTitle = target ? (target.title[I18n.lang] || target.title.ar || target.title.en || targetId) : targetId;
      item.innerHTML = `<span class="rtype">${esc(label)}</span><span>${esc(tTitle)}</span>
        ${note ? `<span class="rel-note">${esc(note[I18n.lang] || note.ar || note.en || '')}</span>` : ''}`;
      if (target) item.onclick = () => this.openDocument(targetId);
      wrap.appendChild(item);
    };
    outgoing.forEach(r => addRel(I18n.t('rel_' + r.type), r.target, r.note));
    incoming.forEach(r => {
      const label = r.type === 'cites' ? I18n.t('citedIn') : I18n.t('rel_' + r.type);
      addRel(label, r.sourceDoc.id, r.note);
    });
  },

  buildToc() {
    const toc = document.getElementById('tocItems');
    toc.innerHTML = '';
    const heads = [...document.querySelectorAll('#docBody h1, #docBody h2, #docBody h3, #docBody h4, #docBody h5, #docBody h6')];
    if (!heads.length) { toc.innerHTML = `<p class="hint">—</p>`; return; }
    const used = new Set([...document.querySelectorAll('#docBody [id]')].map(e => e.id));
    heads.forEach(h => {
      if (!h.id || used.has(h.id) && h.id.indexOf('h-') !== 0) {
        let k = 0;
        while (used.has('h-' + k)) k++;
        h.id = 'h-' + k;
        used.add(h.id);
      }
    });
    const root = { level: 0, children: [] };
    const stack = [root];
    heads.forEach(h => {
      const level = parseInt(h.tagName[1], 10);
      const node = { level, el: h, children: [] };
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });
    const render = (nodes, container) => {
      nodes.forEach(n => {
        const item = document.createElement('div');
        item.className = 'toc-node';
        const row = document.createElement('div');
        row.className = 'toc-item lvl' + n.level;
        const tg = document.createElement('span');
        tg.className = 'toc-toggle' + (n.children.length ? '' : ' leaf');
        tg.textContent = n.children.length ? '\u25be' : '\u00b7';
        tg.onclick = (e) => {
          e.stopPropagation();
          if (!n.children.length) return;
          const collapsed = kids.classList.toggle('collapsed');
          tg.textContent = collapsed ? '\u25b8' : '\u25be';
        };
        row.appendChild(tg);
        const label = document.createElement('span');
        label.className = 'toc-label';
        label.textContent = n.el.textContent.slice(0, 80);
        label.onclick = () => n.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        row.appendChild(label);
        item.appendChild(row);
        const kids = document.createElement('div');
        kids.className = 'toc-children';
        render(n.children, kids);
        item.appendChild(kids);
        container.appendChild(item);
      });
    };
    render(root.children, toc);
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
