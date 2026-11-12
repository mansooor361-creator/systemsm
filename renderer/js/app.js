'use strict';

/* ---------- tiny markdown renderer ---------- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderMarkdown(md) {
  const div = document.createElement('div');
  div.className = 'doc-body';
  const lines = String(md).split('\n');
  let html = '', inList = false, buf = [];

  const flushPara = () => {
    if (buf.length) {
      html += `<p>${inline(buf.join(' '))}</p>`;
      buf = [];
    }
  };
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(\d+)\]/g, '<span class="cite">[$1]</span>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" data-ext="1">$1</a>');

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^#{1,6}\s/.test(line)) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      const level = line.match(/^#+/)[0].length;
      html += `<h${Math.min(level, 4)}>${inline(line.replace(/^#+\s*/, ''))}</h${Math.min(level, 4)}>`;
    } else if (/^>\s?/.test(line)) {
      flushPara();
      html += `<blockquote style="border-inline-start:3px solid var(--accent2);padding-inline-start:12px;color:var(--muted)">${inline(line.replace(/^>\s?/, ''))}</blockquote>`;
    } else if (/^[-*]\s/.test(line)) {
      flushPara();
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`;
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
    const text = document.getElementById('noteText').value;
    if (!this.editingId) return;
    await window.daaix.notesSave({ id: this.editingId, markdown: text });
    this.toastSave();
    await this.refresh();
  },

  toastSave() { App.toast(I18n.t('save') + ' ✓'); },

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

/* ---------- chat ---------- */
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
    log.appendChild(this.bubble('user', esc(q)));
    log.scrollTop = log.scrollHeight;

    const scope = document.getElementById('chatScope').value;
    const res = await this.answer(q, { scope });

    const msg = this.bubble('bot', '');
    msg.appendChild(renderMarkdown(res.answer));
    if (res.passages && res.passages.length) {
      const cites = document.createElement('div');
      cites.innerHTML = `<span class="mode-tag">${I18n.t('chatCitations')}:</span>`;
      res.passages.forEach(p => {
        const a = document.createElement('a');
        a.className = 'cite';
        a.textContent = p.docTitle + (p.articleNum ? ' (' + p.articleNum + ')' : '');
        a.onclick = () => App.openDocument(p.docId);
        cites.appendChild(a);
      });
      msg.appendChild(cites);
    }
    const tag = document.createElement('span');
    tag.className = 'mode-tag';
    tag.textContent = res.mode === 'llm' ? 'AI + KB' : 'KB (extractive, 100% grounded)';
    msg.appendChild(tag);
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
  },

  bubble(role, html) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML = html;
    return div;
  }
};

/* ---------- main app ---------- */
const App = {
  settings: {},
  currentDocId: null,
  openGroups: new Set(),

  async boot() {
    this.settings = (await window.daaix.settingsGet()) || {};
    window.daaixSettings = this.settings;

    I18n.lang = this.settings.language || 'ar';
    document.body.classList.toggle('theme-light', (this.settings.theme || 'dark') === 'light');
    document.body.classList.toggle('theme-dark', (this.settings.theme || 'dark') === 'dark');

    const sample = await fetch('data/kb-sample.json').then(r => r.json());
    KB.load(sample);
    const downloaded = await window.daaix.kbLoadDownloaded();
    KB.addDownloaded(downloaded);
    Retrieval.build();

    document.getElementById('appVersion').textContent = 'v' + (await window.daaix.appVersion());

    this.bindTopbar();
    this.bindViews();
    this.renderTree();
    this.renderHomeStats();
    I18n.apply();
    this.applyLangUi();

    window.daaix.onUpdateAvailable((data) => {
      this.toast(`${I18n.t('updatesAvailable')}: ${data.updates.length}`);
      const status = document.getElementById('updateStatus');
      if (status) status.textContent = `${I18n.t('updatesAvailable')}: ${data.updates.length}`;
    });
  },

  applyLangUi() {
    document.getElementById('btnLang').textContent = I18n.lang === 'ar' ? 'EN' : 'ع';
    const scope = document.getElementById('chatScope');
    scope.options[0].textContent = I18n.t('chatAll');
    scope.options[1].textContent = I18n.t('chatCurrent');
    document.getElementById('graphHint').textContent = I18n.lang === 'ar'
      ? 'انقر على أي عقدة لفتح الوثيقة — الألوان تمثل نوع الوثيقة'
      : 'Click any node to open the document — colors represent document type';
  },

  bindTopbar() {
    document.getElementById('brandHome').onclick = () => this.showView('home');
    document.getElementById('btnChat').onclick = () => this.showView('chat');
    document.getElementById('btnGraph').onclick = () => { this.showView('graph'); Graph.show(this.currentDocId); };
    document.getElementById('btnTools').onclick = () => Tools.open(Tools.active || 'consultant');
    document.getElementById('btnNotes').onclick = () => { this.showView('notes'); Notes.refresh(); };
    document.getElementById('btnSettings').onclick = () => { this.showView('settings'); this.fillSettings(); };
    document.getElementById('btnLang').onclick = () => this.toggleLang();
    document.getElementById('siteLink').onclick = (e) => {
      e.preventDefault();
      window.daaix.openExternal('https://smartk-ai.com/');
    };
    document.getElementById('globalSearch').addEventListener('input', (e) => {
      this.search(e.target.value);
    });
  },

  bindViews() {
    document.getElementById('chatSend').onclick = () => Chat.send();
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Chat.send(); }
    });
    document.getElementById('btnNewNote').onclick = () => Notes.create();
    document.getElementById('btnSaveNote').onclick = () => Notes.save();
    document.getElementById('btnDeleteNote').onclick = () => Notes.remove();

    document.getElementById('btnSaveSettings').onclick = async () => {
      const patch = {
        language: document.getElementById('setLang').value,
        theme: document.getElementById('setTheme').value,
        updateUrl: document.getElementById('setUpdateUrl').value,
        llm: {
          baseUrl: document.getElementById('setLlmUrl').value.trim(),
          apiKey: document.getElementById('setLlmKey').value.trim(),
          model: document.getElementById('setLlmModel').value.trim()
        }
      };
      this.settings = await window.daaix.settingsSet(patch);
      window.daaixSettings = this.settings;
      this.toast(I18n.t('save') + ' ✓');
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

    document.getElementById('setLang').onchange = (e) => { if (e.target.value !== I18n.lang) this.toggleLang(); };
    document.getElementById('setTheme').onchange = (e) => {
      document.body.classList.toggle('theme-dark', e.target.value === 'dark');
      document.body.classList.toggle('theme-light', e.target.value === 'light');
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
  },

  async toggleLang() {
    I18n.lang = I18n.lang === 'ar' ? 'en' : 'ar';
    await window.daaix.settingsSet({ language: I18n.lang });
    I18n.apply();
    this.applyLangUi();
    this.renderTree();
    this.renderHomeStats();
    if (this.currentDocId) this.openDocument(this.currentDocId);
    if (Tools.active) Tools.render(Tools.active);
  },

  showView(name) {
    ['home', 'doc', 'chat', 'graph', 'tools', 'notes', 'settings'].forEach(v => {
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

  renderHomeStats() {
    const docs = KB.index.length;
    const rels = KB.index.reduce((s, e) => s + (e.doc.relations || []).length, 0);
    const arts = KB.index.reduce((s, e) => s + (e.doc.articles || []).length, 0);
    document.getElementById('homeStats').innerHTML = `
      <div class="stat-card"><div class="num">${docs}</div><div class="lbl">${I18n.t('docsCount')}</div></div>
      <div class="stat-card"><div class="num">${rels}</div><div class="lbl">${I18n.t('relationsCount')}</div></div>
      <div class="stat-card"><div class="num">${arts}</div><div class="lbl">${I18n.t('articlesCount')}</div></div>`;
  },

  renderTree() {
    const tree = document.getElementById('kbTree');
    tree.innerHTML = '';
    KB.kbs.forEach(kb => {
      const block = document.createElement('div');
      block.className = 'kb-block';
      const head = document.createElement('div');
      head.className = 'kb-head';
      head.innerHTML = `<span class="kb-icon">${kb.icon || '📚'}</span><span>${esc(kb.name[I18n.lang] || kb.name.ar || kb.name.en)}</span><span class="kb-ver">v${kb.version || ''}</span>`;
      block.appendChild(head);

      const groups = {};
      (kb.documents || []).forEach(d => { (groups[d.type] = groups[d.type] || []).push(d); });

      const body = document.createElement('div');
      body.className = 'kb-body';
      if (!this.openGroups.has(kb.id)) body.style.display = 'none';
      head.onclick = () => {
        const show = body.style.display === 'none';
        body.style.display = show ? '' : 'none';
        if (show) this.openGroups.add(kb.id); else this.openGroups.delete(kb.id);
      };

      Object.keys(groups).forEach(type => {
        const g = document.createElement('div');
        g.className = 'type-group';
        const gHead = document.createElement('div');
        gHead.className = 'type-head';
        const key = kb.id + ':' + type;
        if (this.openGroups.has(key)) gHead.classList.add('open');
        gHead.innerHTML = `<span>${I18n.docTypeNamePl(type)}</span><span class="count">${groups[type].length}</span>`;
        const list = document.createElement('div');
        if (!this.openGroups.has(key)) list.style.display = 'none';
        gHead.onclick = (e) => {
          e.stopPropagation();
          const show = list.style.display === 'none';
          list.style.display = show ? '' : 'none';
          gHead.classList.toggle('open', show);
          if (show) this.openGroups.add(key); else this.openGroups.delete(key);
        };
        groups[type].forEach(doc => {
          const item = document.createElement('div');
          item.className = 'doc-item' + (doc.id === this.currentDocId ? ' active' : '');
          item.innerHTML = `<span class="dot" style="color:var(--accent)">●</span>${esc(doc.title[I18n.lang] || doc.title.ar || doc.title.en)}`;
          item.onclick = () => this.openDocument(doc.id);
          list.appendChild(item);
        });
        g.appendChild(gHead);
        g.appendChild(list);
        body.appendChild(g);
      });

      block.appendChild(body);
      tree.appendChild(block);
    });
  },

  openDocument(id) {
    const doc = KB.get(id);
    if (!doc) return;
    this.currentDocId = id;
    this.showView('doc');
    this.renderTree();

    const title = doc.title[I18n.lang] || doc.title.ar || doc.title.en;
    const header = document.getElementById('docHeader');
    header.innerHTML = `<h1>${esc(title)}</h1>
      <div class="doc-meta">
        <span class="chip type">${I18n.docTypeName(doc.type)}</span>
        <span class="chip status">${I18n.t('status_' + (doc.status || 'in_force'))}</span>
        <span class="chip">${I18n.t('issuer')}: ${esc(doc.issuer ? (doc.issuer[I18n.lang] || doc.issuer.ar || doc.issuer.en || '—') : '—')}</span>
        <span class="chip">${I18n.t('number')}: ${esc(doc.number || '—')}</span>
        <span class="chip">${I18n.t('date')}: ${esc(doc.date || '—')}</span>
        <span class="chip">${I18n.t('version')}: ${doc.version}</span>
      </div>`;

    const bodyEl = document.getElementById('docBody');
    bodyEl.innerHTML = '';

    if (doc.summary) {
      const s = document.createElement('p');
      s.style.color = 'var(--muted)';
      s.textContent = doc.summary[I18n.lang] || doc.summary.ar || doc.summary.en || '';
      bodyEl.appendChild(s);
    }

    if (doc.type === 'ruling' || doc.type === 'principle') {
      (doc.articles || []).forEach(a => {
        const aTitle = a.title ? (a.title[I18n.lang] || a.title.ar || a.title.en || '') : '';
        const card = document.createElement('div');
        card.className = 'article-card';
        card.innerHTML = `<div class="anum">${esc(a.num || '')}${aTitle ? ' — ' + esc(aTitle) : ''}</div><div>${esc(a.text || '')}</div>`;
        bodyEl.appendChild(card);
      });
    } else if ((doc.articles || []).length) {
      const h = document.createElement('h2');
      h.textContent = I18n.t('articles');
      bodyEl.appendChild(h);
      doc.articles.forEach(a => {
        const aTitle = a.title ? (a.title[I18n.lang] || a.title.ar || a.title.en || '') : '';
        const card = document.createElement('div');
        card.className = 'article-card';
        card.innerHTML = `<div class="anum">${esc(a.num || '')}${aTitle ? ' — ' + esc(aTitle) : ''}</div><div>${esc(a.text || '')}</div>`;
        bodyEl.appendChild(card);
      });
    }

    if (doc.body) bodyEl.appendChild(renderMarkdown(doc.body));

    this.renderDocSide(doc);
  },

  renderDocSide(doc) {
    const side = document.getElementById('docSide');
    side.innerHTML = '';

    const actions = document.createElement('div');
    actions.className = 'side-actions';
    const chatBtn = document.createElement('button');
    chatBtn.className = 'primary';
    chatBtn.textContent = '💬 ' + I18n.t('chatTitle');
    chatBtn.onclick = () => {
      document.getElementById('chatScope').value = 'current';
      this.showView('chat');
    };
    const graphBtn = document.createElement('button');
    graphBtn.className = 'primary';
    graphBtn.textContent = '🕸️ ' + I18n.t('inGraph');
    graphBtn.onclick = () => { this.showView('graph'); Graph.show(doc.id); };
    actions.appendChild(chatBtn);
    actions.appendChild(graphBtn);
    side.appendChild(actions);

    const { outgoing, incoming } = KB.relationsOf(doc.id);

    const block = (titleText) => {
      const b = document.createElement('div');
      b.className = 'side-block';
      const h = document.createElement('h3');
      h.textContent = titleText;
      b.appendChild(h);
      return b;
    };

    if ((doc.versionHistory || []).length) {
      const vb = block(I18n.t('versionHistory'));
      [...doc.versionHistory].sort((a, b) => b.version - a.version).forEach(v => {
        const item = document.createElement('div');
        item.className = 'ver-item';
        item.innerHTML = `<div class="v">${I18n.t('version')} ${v.version} — ${esc(v.date || '')}</div>
          <div class="c">${esc(v.change ? (v.change[I18n.lang] || v.change.ar || v.change.en || '') : '')}</div>
          ${v.by ? `<div class="d">${esc(v.by)}</div>` : ''}`;
        vb.appendChild(item);
      });
      side.appendChild(vb);
    }

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
      const sb = block(I18n.t('sources'));
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
      const snippet = (doc.summary ? (doc.summary.ar || doc.summary.en || '') : (doc.body || '')).slice(0, 140);
      item.innerHTML = `<div class="t">${esc(title)}</div>
        <div class="m">${I18n.docTypeName(doc.type)} · ${esc(r.kbName ? (r.kbName[I18n.lang] || r.kbName.ar || r.kbName.en) : '')} · ${Math.round(r.score * 100)}</div>
        <div class="snip">${esc(snippet)}…</div>`;
      item.onclick = () => { document.getElementById('globalSearch').value = ''; this.openDocument(doc.id); };
      box.appendChild(item);
    });
  }
};

window.addEventListener('DOMContentLoaded', () => App.boot());
