'use strict';

/* ---------- markdown renderer (with Obsidian-style callouts) ---------- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* v1.6.29: classic outline magnifier (monochrome, follows text color) */
const LENS_SVG = '<svg class="lens" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="9" r="5.2"/><line x1="13" y1="13" x2="17.4" y2="17.4" stroke-linecap="round"/></svg>';

const CALLOUTS = {
  note: { cls: 'co-note', icon: '✎' },
  info: { cls: 'co-info', icon: 'ℹ︎' },
  tip: { cls: 'co-tip', icon: '✦' },
  warning: { cls: 'co-warning', icon: '⚠︎' },
  caution: { cls: 'co-caution', icon: '✕' },
  danger: { cls: 'co-caution', icon: '✕' },
  example: { cls: 'co-example', icon: '§' },
  quote: { cls: 'co-quote', icon: '❝' }
};

function renderMarkdown(md) {
  const div = document.createElement('div');
  div.className = 'doc-body';
  div.innerHTML = renderMdLines(String(md).split('\n'));
  div.querySelectorAll('a[data-ext]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.daaix) window.daaix.openExternal(a.href);
  }));
  return div;
}

/* v1.6.26: shared markdown line renderer — robust headings (space after # optional,
   trailing # stripped) so reading view never shows raw #; h1-h4 render inline,
   h5/h6 always collapse into <details class="deep-fold"> (open on demand) */
function renderMdLines(lines) {
  let html = '', inList = false, buf = [];

  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(\d+)\]/g, '<span class="cite" data-cite="$1">[$1]</span>')
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

    const isTableSep = (l) => /^\|[\s:|-]+\|?\s*$/.test(l.trim()) && l.includes('-');
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(line);
      let j2 = i + 2;
      const rows = [];
      while (j2 < lines.length && /^\s*\|.*\|?\s*$/.test(lines[j2]) && lines[j2].includes('|') && !isTableSep(lines[j2])) {
        rows.push(cells(lines[j2]));
        j2++;
      }
      i = j2 - 1;
      html += '<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
      continue;
    }

    const hm = line.match(/^(#{1,6})\s*(.*)$/);
    const htext = hm ? hm[2].replace(/\s*#+\s*$/, '').trim() : '';
    if (hm && htext) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      const level = hm[1].length;
      const anchor = 'h-' + html.length;
      if (level <= 5) {
        html += `<h${level} id="${anchor}">${inline(htext)}</h${level}>`;
      } else {
        /* deep heading (###### only): small heading, collapsed by default with expand state; fold ends at the next heading of level <= 5 */
        let j = i + 1;
        while (j < lines.length) {
          const m2 = lines[j].match(/^#{1,6}\s*\S/);
          if (m2 && m2[0].match(/^#+/)[0].length <= 5) break;
          j++;
        }
        const inner = renderMdLines(lines.slice(i + 1, j));
        html += `<details class="deep-fold"><summary class="fold-head"><h${level} id="${anchor}">${inline(htext)}</h${level}><span class="fold-arrow">\u25b8</span></summary><div class="fold-body">${inner}</div></details>`;
        i = j - 1;
      }
      continue;
    }

    /* v1.6.34: canonical numbered paragraph "1  . text" / compound "1/1  . text" */
    const npm2 = line.match(/^(\d{1,4}(?:\/\d{1,4})?)  \.(?: (.*))?$/);
    if (npm2) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      html += `<div class="num-p"><span class="num-p-num">${esc(npm2[1] + '  . ')}</span><span class="num-p-text">${inline(npm2[2] || '')}</span></div>`;
      continue;
    }
    /* v1.6.34: canonical literal (lettered) paragraph "\t* أ  . text" */
    const litm = line.match(/^\t\* ([\u0623\u0628\u062C\u062F\u0647\u0648\u0632\u062D\u0637\u0643\u0644\u0645\u0646\u0633\u0639\u0641\u0642\u0631\u0634\u062A\u0638])\u0640?  \.(?: (.*))?$/);
    if (litm) {
      flushPara();
      if (inList) { html += '</ul>'; inList = false; }
      html += `<div class="lit-p"><span class="lit-p-num"><span class="lit-dot">•</span> ${esc(litm[1])}  . </span><span class="lit-p-text">${inline(litm[2] || '')}</span></div>`;
      continue;
    }

    if (/^>\s?/.test(line)) {
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
  return html;
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
    /* v1.6.37: respect user-deleted sample KBs */
    if (Array.isArray(this.settings.deletedSampleKbs) && this.settings.deletedSampleKbs.length) {
      KB.kbs = KB.kbs.filter(k => !this.settings.deletedSampleKbs.includes(k.id));
    }
    const downloaded = await window.daaix.kbLoadDownloaded();
    KB.addDownloaded(downloaded);
    this._downloadedKbIds = new Set((downloaded || []).map(k => k.id));
    Retrieval.build();


    this.bindTopbar();
    this.bindQuickSwitcher();
    this.bindDrawer();
    this.bindViews();
    this.bindSettingsTabs();
    this.bindSkillsCtx();
    this.bindReaderTabs();
    this.bindLogin();
    this.renderAll();
    I18n.apply();

    window.daaix.onUpdateAvailable((data) => {
      this.toast(`${I18n.t('updatesAvailable')}: ${data.updates.length}`);
    });

    /* v1.6.31: watched connectors — check for new items every minute */
    this._connChecking = false;
    setInterval(() => { this.autoCheckConnectors(); }, 60000);
  },

  /* ---------- v1.6.25: Obsidian-style quick switcher (Ctrl+O) ---------- */
  bindQuickSwitcher() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'o' || e.key === 'O' || e.key === 'خ')) {
        e.preventDefault();
        this.toggleQuickSwitcher();
      } else if (e.key === 'Escape') {
        const qs = document.getElementById('quickSwitcher');
        if (qs && !qs.classList.contains('hidden')) this.closeQuickSwitcher();
        const sr = document.getElementById('searchResults');
        if (sr && !sr.classList.contains('hidden')) sr.classList.add('hidden');
      }
    });
  },

  toggleQuickSwitcher() {
    const qs = document.getElementById('quickSwitcher');
    if (qs && !qs.classList.contains('hidden')) this.closeQuickSwitcher();
    else this.openQuickSwitcher();
  },

  openQuickSwitcher() {
    let qs = document.getElementById('quickSwitcher');
    if (!qs) {
      qs = document.createElement('div');
      qs.id = 'quickSwitcher';
      qs.innerHTML = `<div class="qs-backdrop"></div>
        <div class="qs-panel">
          <div class="qs-head"><span class="qs-glyph">⌘</span><span class="qs-title">${esc(I18n.t('qsTitle'))}</span><span class="qs-kbd">Ctrl+O</span></div>
          <input id="qsInput" type="text" placeholder="${esc(I18n.t('qsPh'))}" autocomplete="off" />
          <div id="qsResults" class="qs-results"></div>
        </div>`;
      document.body.appendChild(qs);
      qs.querySelector('.qs-backdrop').onclick = () => this.closeQuickSwitcher();
      const input = qs.querySelector('#qsInput');
      input.addEventListener('input', () => this.renderQuickSwitcher(input.value));
      input.addEventListener('keydown', (e) => {
        const items = [...qs.querySelectorAll('.qs-item')];
        let idx = items.findIndex(el => el.classList.contains('active'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!items.length) return;
          idx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
          items.forEach((el, i) => el.classList.toggle('active', i === idx));
          items[idx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (idx >= 0) items[idx].click();
          else if (items.length) items[0].click();
        }
      });
    }
    qs.classList.remove('hidden');
    const input = qs.querySelector('#qsInput');
    input.value = '';
    this.renderQuickSwitcher('');
    input.focus();
  },

  closeQuickSwitcher() {
    const qs = document.getElementById('quickSwitcher');
    if (qs) qs.classList.add('hidden');
  },

  renderQuickSwitcher(q) {
    const box = document.getElementById('qsResults');
    if (!box) return;
    box.innerHTML = '';
    const query = (q || '').trim();
    let docs;
    if (query.length >= 2) {
      docs = KB.search(query, 20).map(r => r.doc);
    } else {
      docs = KB.index.slice(0, 20).map(e => e.doc);
    }
    docs.forEach((doc, i) => {
      const title = doc.title[I18n.lang] || doc.title.ar || doc.title.en;
      const b = document.createElement('button');
      b.className = 'qs-item' + (i === 0 ? ' active' : '');
      b.innerHTML = `<span class="qs-doc-icon mono">▤</span><span class="qs-doc-title">${esc(title)}</span><span class="qs-doc-type">${esc(I18n.docTypeName(doc.type))}</span>`;
      /* v1.6.42: quick-switcher results open in the CURRENT window (back ‹ returns) */
      b.onclick = () => { this.closeQuickSwitcher(); this.navInTab({ kind: 'doc', docId: doc.id }); };
      box.appendChild(b);
    });
    if (!docs.length) box.innerHTML = `<p class="hint qs-empty">${I18n.t('noResults')}</p>`;
  },

  applyTheme(theme) {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
    this.applyFontSettings();
    this.applyReadingVars();
    this.applyTypographySettings();
  },

  /* v1.6.37: per-level heading backgrounds + content (paper) background */
  applyReadingVars() {
    const root = document.body.style;
    const ok = (v) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test((v || '').trim());
    for (let i = 1; i <= 6; i++) {
      const v = ((this.settings || {})['hBg' + i] || '').trim();
      if (ok(v)) root.setProperty('--h-bg' + i, v); else root.removeProperty('--h-bg' + i);
    }
    const p = ((this.settings || {}).paperBg || '').trim();
    if (ok(p)) { root.setProperty('--paper', p); root.setProperty('--paper-override', p); }
    else { root.removeProperty('--paper'); root.removeProperty('--paper-override'); }
  },

  bindReadingStyle() {
    for (let i = 1; i <= 6; i++) {
      const hex = document.getElementById('setHBg' + i);
      const col = document.getElementById('setHBg' + i + 'c');
      if (!hex || !col) continue;
      hex.onchange = () => {
        this.settings['hBg' + i] = hex.value.trim();
        window.daaix.settingsSet({ ['hBg' + i]: this.settings['hBg' + i] });
        this.applyReadingVars();
      };
      col.onchange = () => {
        this.settings['hBg' + i] = col.value;
        hex.value = col.value;
        window.daaix.settingsSet({ ['hBg' + i]: col.value });
        this.applyReadingVars();
      };
    }
    const pt = document.getElementById('setPaperBgT');
    const pc = document.getElementById('setPaperBgC');
    pt.onchange = () => {
      this.settings.paperBg = pt.value.trim();
      window.daaix.settingsSet({ paperBg: this.settings.paperBg });
      this.applyReadingVars();
    };
    pc.onchange = () => {
      this.settings.paperBg = pc.value;
      pt.value = pc.value;
      window.daaix.settingsSet({ paperBg: pc.value });
      this.applyReadingVars();
    };
    document.getElementById('btnReadStyleReset').onclick = async () => {
      for (let i = 1; i <= 6; i++) { delete this.settings['hBg' + i]; await window.daaix.settingsSet({ ['hBg' + i]: '' }); }
      delete this.settings.paperBg;
      await window.daaix.settingsSet({ paperBg: '' });
      this.applyReadingVars();
      this.fillSettings();
    };
  },

  fillReadingStyle() {
    for (let i = 1; i <= 6; i++) {
      const v = this.settings['hBg' + i] || '';
      const hexEl = document.getElementById('setHBg' + i);
      const colEl = document.getElementById('setHBg' + i + 'c');
      if (hexEl) hexEl.value = v;
      if (colEl) colEl.value = v || '#000000';
    }
    const t = document.getElementById('setPaperBgT');
    if (t) t.value = this.settings.paperBg || '';
    const c = document.getElementById('setPaperBgC');
    if (c) c.value = this.settings.paperBg || '#000000';
  },

  /* v1.6.40: per-level heading typography + per-level content (section) styling */
  applyTypographySettings() {
    const root = document.body.style;
    const okColor = (v) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test((v || '').trim());
    const fam = (v) => v && v.trim() ? `'${v.trim().replace(/'/g, '')}', 'Segoe UI', Tahoma, 'Noto Naskh Arabic', system-ui, sans-serif` : null;
    const px = (v, lo, hi) => { const n = parseInt(v, 10); return (n >= lo && n <= hi) ? n + 'px' : null; };
    for (let i = 1; i <= 6; i++) {
      const pairs = [
        ['hFont' + i, '--h-font' + i, fam((this.settings || {})['hFont' + i])],
        ['hSize' + i, '--h-size' + i, px((this.settings || {})['hSize' + i], 10, 48)],
        ['hFg' + i, '--h-fg' + i, okColor((this.settings || {})['hFg' + i]) ? String((this.settings || {})['hFg' + i]).trim() : null],
        ['secFont' + i, '--sec-font' + i, fam((this.settings || {})['secFont' + i])],
        ['secSize' + i, '--sec-size' + i, px((this.settings || {})['secSize' + i], 10, 40)],
        ['secFg' + i, '--sec-fg' + i, okColor((this.settings || {})['secFg' + i]) ? String((this.settings || {})['secFg' + i]).trim() : null],
        ['secBg' + i, '--sec-bg' + i, okColor((this.settings || {})['secBg' + i]) ? String((this.settings || {})['secBg' + i]).trim() : null]
      ];
      pairs.forEach(([key, varName, val]) => {
        if (val) root.setProperty(varName, val); else root.removeProperty(varName);
      });
    }
  },

  bindTypography() {
    const fire = () => { this.applyTypographySettings(); };
    for (let n = 1; n <= 6; n++) {
      /* headings: font / size / text color (bg inputs are bound in bindReadingStyle) */
      const hf = document.getElementById('setHFont' + n);
      if (hf) hf.onchange = () => {
        this.settings['hFont' + n] = hf.value.trim();
        window.daaix.settingsSet({ ['hFont' + n]: this.settings['hFont' + n] });
        fire();
      };
      const hs = document.getElementById('setHSize' + n);
      if (hs) hs.onchange = () => {
        this.settings['hSize' + n] = hs.value.trim();
        window.daaix.settingsSet({ ['hSize' + n]: this.settings['hSize' + n] });
        fire();
      };
      const hexFg = document.getElementById('setHFg' + n);
      const colFg = document.getElementById('setHFg' + n + 'c');
      if (hexFg && colFg) {
        hexFg.onchange = () => {
          this.settings['hFg' + n] = hexFg.value.trim();
          colFg.value = hexFg.value.trim();
          window.daaix.settingsSet({ ['hFg' + n]: this.settings['hFg' + n] });
          fire();
        };
        colFg.onchange = () => {
          this.settings['hFg' + n] = colFg.value;
          hexFg.value = colFg.value;
          window.daaix.settingsSet({ ['hFg' + n]: colFg.value });
          fire();
        };
      }
      /* content (section) below the heading: font / size / text color / background */
      const sf = document.getElementById('setSecFont' + n);
      if (sf) sf.onchange = () => {
        this.settings['secFont' + n] = sf.value.trim();
        window.daaix.settingsSet({ ['secFont' + n]: this.settings['secFont' + n] });
        fire();
      };
      const ss = document.getElementById('setSecSize' + n);
      if (ss) ss.onchange = () => {
        this.settings['secSize' + n] = ss.value.trim();
        window.daaix.settingsSet({ ['secSize' + n]: this.settings['secSize' + n] });
        fire();
      };
      const hexSfg = document.getElementById('setSecFg' + n);
      const colSfg = document.getElementById('setSecFg' + n + 'c');
      if (hexSfg && colSfg) {
        hexSfg.onchange = () => {
          this.settings['secFg' + n] = hexSfg.value.trim();
          colSfg.value = hexSfg.value.trim();
          window.daaix.settingsSet({ ['secFg' + n]: this.settings['secFg' + n] });
          fire();
        };
        colSfg.onchange = () => {
          this.settings['secFg' + n] = colSfg.value;
          hexSfg.value = colSfg.value;
          window.daaix.settingsSet({ ['secFg' + n]: colSfg.value });
          fire();
        };
      }
      const hexSbg = document.getElementById('setSecBg' + n);
      const colSbg = document.getElementById('setSecBg' + n + 'c');
      if (hexSbg && colSbg) {
        hexSbg.onchange = () => {
          this.settings['secBg' + n] = hexSbg.value.trim();
          colSbg.value = hexSbg.value.trim();
          window.daaix.settingsSet({ ['secBg' + n]: this.settings['secBg' + n] });
          fire();
        };
        colSbg.onchange = () => {
          this.settings['secBg' + n] = colSbg.value;
          hexSbg.value = colSbg.value;
          window.daaix.settingsSet({ ['secBg' + n]: colSbg.value });
          fire();
        };
      }
    }
  },

  fillTypography() {
    for (let n = 1; n <= 6; n++) {
      const set = (id, val, def) => { const el = document.getElementById(id); if (el) el.value = val || def || ''; };
      set('setHFont' + n, this.settings['hFont' + n]);
      set('setHSize' + n, this.settings['hSize' + n]);
      set('setHFg' + n, this.settings['hFg' + n]);
      set('setHFg' + n + 'c', this.settings['hFg' + n], '#000000');
      set('setSecFont' + n, this.settings['secFont' + n]);
      set('setSecSize' + n, this.settings['secSize' + n]);
      set('setSecFg' + n, this.settings['secFg' + n]);
      set('setSecFg' + n + 'c', this.settings['secFg' + n], '#000000');
      set('setSecBg' + n, this.settings['secBg' + n]);
      set('setSecBg' + n + 'c', this.settings['secBg' + n], '#000000');
    }
  },

  /* wrap the content that follows each heading of level n (until the next
     heading of level <= n) into a per-level section div .doc-sec.lvl-n */
  wrapReadingSections(bodyEl) {
    const container = bodyEl && (bodyEl.querySelector(':scope > .doc-body') || bodyEl);
    if (!container || !container.children) return;
    const headLvl = (el) => {
      if (!el || !el.matches) return 0;
      if (/^H[1-6]$/.test(el.tagName)) return parseInt(el.tagName[1], 10);
      if (el.classList && el.classList.contains('deep-fold')) {
        const h = el.querySelector('summary h1, summary h2, summary h3, summary h4, summary h5, summary h6');
        return h ? parseInt(h.tagName[1], 10) : 6;
      }
      return 0;
    };
    for (let n = 1; n <= 6; n++) {
      const parents = [container, ...container.querySelectorAll('*')];
      for (const parent of parents) {
        let guard = 0;
        while (guard++ < 500) {
          const kids = [...(parent.children || [])];
          const idx = kids.findIndex(k => k.matches && k.matches('h' + n));
          if (idx === -1) break;
          let j = idx + 1;
          while (j < kids.length) {
            const lvl = headLvl(kids[j]);
            if (lvl && lvl <= n) break;
            j++;
          }
          const sec = document.createElement('div');
          sec.className = 'doc-sec lvl-' + n;
          kids[idx].insertAdjacentElement('afterend', sec);
          kids.slice(idx + 1, j).forEach(k => sec.appendChild(k));
        }
      }
    }
  },

  /* v1.6.36: Obsidian-style font settings — family / size / text color as CSS vars */
  applyFontSettings() {
    const root = document.body.style;
    const fam = (this.settings || {}).fontFam;
    const size = parseInt((this.settings || {}).fontSize, 10);
    const color = (this.settings || {}).fontColor;
    if (fam && fam.trim()) root.setProperty('--font-ui', `'${fam.trim().replace(/'/g, '')}', 'Segoe UI', Tahoma, 'Noto Naskh Arabic', system-ui, sans-serif`);
    else root.removeProperty('--font-ui');
    if (size >= 12 && size <= 22) root.setProperty('--font-size', size + 'px');
    else root.removeProperty('--font-size');
    if (color && color.trim()) { root.setProperty('--text', color.trim()); root.setProperty('--paper-text', color.trim()); }
    else { root.removeProperty('--text'); root.removeProperty('--paper-text'); }
  },

  renderAll() {
    this.renderKbPicker();
    this.renderToolRail();
    this.renderHomeLauncher();
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
    if (modeBtn) modeBtn.innerHTML = LENS_SVG;
    /* v1.6.42: home button — home behaves like any page (goHome) */
    document.getElementById('btnRailHome').onclick = () => this.goHome();
    document.getElementById('btnSearchMode').onclick = (e) => {
      e.stopPropagation();
      this.renderSearchModeMenu();
      document.getElementById('searchModeMenu').classList.toggle('hidden');
    };
    document.addEventListener('click', (e) => {
      ['kbPickerMenu', 'searchModeMenu'].forEach(id => {
        const menu = document.getElementById(id);
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) {
          menu.classList.add('hidden');
        }
      });
      /* v1.6.42: click outside the search box/results closes the results dropdown */
      const sr = document.getElementById('searchResults');
      if (sr && !sr.classList.contains('hidden')) {
        const tgt = e.target;
        const inside = sr.contains(tgt) || tgt === document.getElementById('globalSearch') ||
          (tgt && tgt.closest && tgt.closest('#globalSearch'));
        if (!inside) sr.classList.add('hidden');
      }
    });
    document.getElementById('btnKbPicker').onclick = (e) => {
      e.stopPropagation();
      const menu = document.getElementById('kbPickerMenu');
      if (menu.classList.contains('hidden')) {
        const r = e.currentTarget.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (r.bottom + 6) + 'px';
        menu.style.insetInlineStart = 'auto';
        menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 300)) + 'px';
      }
      menu.classList.toggle('hidden');
    };
    document.getElementById('btnDrawer').onclick = () => this.openDrawer();
    document.getElementById('btnAgents').onclick = () => Agents.open(Agents.current);
    document.getElementById('btnNotes').onclick = () => this.openTab({ kind: 'notes' });
    document.getElementById('siteLink').onclick = (e) => {
      e.preventDefault();
      window.daaix.openExternal('https://smartk-ai.com/');
    };
    document.getElementById('globalSearch').addEventListener('input', (e) => {
      clearTimeout(this._searchTimer);
      const v = e.target.value;
      this._searchTimer = setTimeout(() => this.search(v), 160);
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
      this.goHome();
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
        this.goHome();
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
    /* v1.6.25: the reliable way to connect ANY cloud — its sync folder */
    const sync = document.createElement('div');
    sync.className = 'cloud-row cloud-sync';
    sync.innerHTML = `<span class="sr-icon mono">\u2601</span>
      <div class="sr-main"><div class="sr-name">${esc(I18n.t('srcCloud'))}</div>
      <div class="sr-desc">${esc(I18n.t('cloudSyncHint'))}</div></div>
      <button class="ghost-btn cloud-link-folder">${esc(I18n.t('srcFolder'))}</button>`;
    sync.querySelector('.cloud-link-folder').onclick = () => {
      panel.classList.add('hidden');
      this.doImportFolder(document.getElementById('kbAddStatus'));
    };
    panel.appendChild(sync);
    this.KB_CLOUDS.forEach(c => {
      const row = document.createElement('div');
      row.className = 'cloud-row';
      row.innerHTML = `<span class="sr-icon mono">${c.icon}</span>
        <div class="sr-main"><div class="sr-name">${esc(c.name)}</div>
        <div class="sr-desc">${esc(I18n.t('cloudSyncHint'))}</div></div>
        <button class="ghost-btn">${I18n.t('cloudConnect')}</button>`;
      row.querySelector('button').onclick = () => {
        window.daaix.openExternal(c.url);
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
      row.className = 'set-card';
      row.innerHTML = `
        <div class="sc-head">
          <span class="sr-icon">${kb.icon || '\ud83d\udcda'}</span>
          <div class="sr-main">
            <div class="sr-name">${esc(name)} <span class="cat-chip src">${esc(src)}</span></div>
            <div class="sr-desc">${(kb.documents || []).length} ${I18n.t('documentsPl')}</div>
          </div>
        </div>
        <div class="sc-foot">
          ${kb.sourcePath ? `<button class="ghost-btn kb-rescan">${I18n.t('refreshKb')}</button>` : ''}
          <label class="switch"><input type="checkbox" ${this.kbIsOn(kb.id) ? 'checked' : ''} /><span class="sl"></span></label>
          <button class="danger kb-del">${I18n.t('kbDelete')}</button>
        </div>`;
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
      /* v1.6.37: delete a KB — two-step confirm; downloaded/local KBs are removed
         from disk, sample KBs are remembered as deleted and filtered at boot */
      const delBtn = row.querySelector('.kb-del');
      delBtn.onclick = async () => {
        if (delBtn.dataset.armed !== '1') {
          delBtn.dataset.armed = '1';
          delBtn.textContent = I18n.t('kbDeleteConfirm');
          setTimeout(() => { delBtn.dataset.armed = ''; delBtn.textContent = I18n.t('kbDelete'); }, 3500);
          return;
        }
        const isDownloaded = (this._downloadedKbIds || new Set()).has(kb.id) || !!kb.sourcePath;
        if (isDownloaded && window.daaix.kbDeleteDownloaded) await window.daaix.kbDeleteDownloaded(kb.id);
        else {
          const del = new Set(this.settings.deletedSampleKbs || []);
          del.add(kb.id);
          this.settings.deletedSampleKbs = [...del];
          await window.daaix.settingsSet({ deletedSampleKbs: this.settings.deletedSampleKbs });
        }
        KB.kbs = KB.kbs.filter(k => k.id !== kb.id);
        KB.rebuild();
        this.renderAll();
        this.toast(I18n.t('kbDeleted'));
      };
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
        row.className = 'set-card';
        row.innerHTML = `
          <div class="sc-head">
            <span class="sr-icon">${t.icon}</span>
            <div class="sr-main">
              <div class="sr-name">${esc(t.label)} <span class="cat-chip ${t.cat}">${esc(I18n.t('cat_' + t.cat))}</span></div>
              <div class="sr-desc">${esc(t.desc || '')}</div>
            </div>
          </div>
          <div class="sc-foot">
            <label class="switch"><input type="checkbox" ${this.toolIsOn(t.id) ? 'checked' : ''} /><span class="sl"></span></label>
          </div>`;
        row.querySelector('input').onchange = async (e) => {
          this.settings.toolEnabled[t.id] = e.target.checked;
          await window.daaix.settingsSet({ toolEnabled: this.settings.toolEnabled });
          Tools.renderMenu();
          this.renderToolRail();
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
      b.textContent = t.glyph || t.icon;
      b.onclick = () => Tools.open(t.id);
      wrap.appendChild(b);
    });
  },

  /* v1.6.42: Obsidian-style settings — sidebar categories on the start side (right in RTL),
     detail area beside them; the chosen category is persisted like an opened tool. */
  setNavPanes: ['settings', 'reading', 'updates', 'kbs', 'tools', 'ai'],

  applySettingsNav(id) {
    document.querySelectorAll('#setTabs .set-tab').forEach(b => b.classList.toggle('active', b.dataset.set === id));
    this.setNavPanes.forEach(p => {
      const pane = document.getElementById('setPane' + p.charAt(0).toUpperCase() + p.slice(1));
      if (pane) pane.classList.toggle('hidden', p !== id);
    });
  },

  bindSettingsTabs() {
    const btns = [...document.querySelectorAll('#setTabs .set-tab')];
    btns.forEach(btn => {
      btn.onclick = () => {
        this.applySettingsNav(btn.dataset.set);
        this.settings.settingsNav = btn.dataset.set;
        window.daaix.settingsSet({ settingsNav: btn.dataset.set });
      };
    });
    const navSearch = document.getElementById('setNavSearch');
    if (navSearch) navSearch.oninput = () => {
      const q = (navSearch.value || '').trim().toLowerCase();
      btns.forEach(b => { b.classList.toggle('hide-nav', !!q && !(I18n.t(b.dataset.i18n) || b.textContent).toLowerCase().includes(q)); });
    };
    const saved = this.settings.settingsNav;
    if (saved && this.setNavPanes.includes(saved) && btns.some(b => b.dataset.set === saved)) this.applySettingsNav(saved);
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
    document.getElementById('btnTocCollapse').onclick = () => {
      this.tocCollapsed = !this.tocCollapsed;
      const b = document.getElementById('btnTocCollapse');
      b.textContent = this.tocCollapsed ? '\u2304' : '\u2303';
      b.title = I18n.t(this.tocCollapsed ? 'tocExpandAll' : 'tocCollapseAll');
      this.buildToc();
    };
    document.getElementById('btnSaveEdits').onclick = () => this.saveEdits();
    document.getElementById('btnDiscardEdits').onclick = () => this.discardEdits();

    /* v1.6.32: folder import removed from the settings page — KB management keeps its own import */
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
      connectors.push({ name: '', url: '', apiKey: '', enabled: true, interval: 30, lastCheck: '', items: [] });
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
    /* v1.6.36: Obsidian-style font settings */
    document.getElementById('setFontFam').onchange = (e) => {
      this.settings.fontFam = e.target.value.trim();
      window.daaix.settingsSet({ fontFam: this.settings.fontFam });
      this.applyFontSettings();
    };
    document.getElementById('setFontSize').onchange = (e) => {
      let v = parseInt(e.target.value, 10);
      if (isNaN(v)) v = 16;
      v = Math.max(12, Math.min(22, v));
      e.target.value = v;
      this.settings.fontSize = v;
      window.daaix.settingsSet({ fontSize: v });
      this.applyFontSettings();
    };
    document.getElementById('setFontColor').onchange = (e) => {
      this.settings.fontColor = e.target.value;
      window.daaix.settingsSet({ fontColor: this.settings.fontColor });
      this.applyFontSettings();
    };
    document.getElementById('btnFontResetHis').onclick = () => {
      delete this.settings.fontFam;
      delete this.settings.fontSize;
      delete this.settings.fontColor;
      window.daaix.settingsSet({ fontFam: '', fontSize: '', fontColor: '' });
      this.applyFontSettings();
      this.fillSettings();
    };
    this.bindReadingStyle();
    this.bindTypography();
    /* v1.6.38: restore factory appearance/layout in one click (side of the first card) */
    document.getElementById('btnFactoryReset').onclick = async () => {
      const resetKeys = {};
      ['fontFam', 'fontSize', 'fontColor', 'paperBg', 'tocW', 'propsW', 'propsCollapsed',
       'hBg1', 'hBg2', 'hBg3', 'hBg4', 'hBg5', 'hBg6',
         'hFont1', 'hFont2', 'hFont3', 'hFont4', 'hFont5', 'hFont6',
         'hSize1', 'hSize2', 'hSize3', 'hSize4', 'hSize5', 'hSize6',
         'hFg1', 'hFg2', 'hFg3', 'hFg4', 'hFg5', 'hFg6',
         'secFont1', 'secFont2', 'secFont3', 'secFont4', 'secFont5', 'secFont6',
         'secSize1', 'secSize2', 'secSize3', 'secSize4', 'secSize5', 'secSize6',
         'secFg1', 'secFg2', 'secFg3', 'secFg4', 'secFg5', 'secFg6',
         'secBg1', 'secBg2', 'secBg3', 'secBg4', 'secBg5', 'secBg6'].forEach(k => { delete this.settings[k]; resetKeys[k] = ''; });
      resetKeys.theme = 'dark';
      this.settings.theme = 'dark';
      await window.daaix.settingsSet(resetKeys);
      this.applyTheme('dark');
      this.applyColumnWidths();
      this.fillSettings();
      this.toast('\u2713 ' + I18n.t('factoryResetDone'));
      document.getElementById('setTheme').value = 'dark';
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

/* ---------- v1.6.39: skills context menu on selection + run popup + margin notes ---------- */
  bindSkillsCtx() {
    document.addEventListener('contextmenu', (e) => {
      const body = document.getElementById('docBody');
      if (!body || !body.contains(e.target)) return;
      const sel = window.getSelection ? window.getSelection() : null;
      const text = sel ? String(sel.toString() || '').trim() : '';
      if (!text) return; /* plain right-click stays default */
      e.preventDefault();
      this._selRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;
      this._selText = text;
      this.openSkillCtxMenu(e.clientX, e.clientY);
    });
  },

  openSkillCtxMenu(x, y) {
    this.closeSkillCtxMenu();
    const menu = document.createElement('div');
    menu.id = 'skillCtxMenu';
    menu.className = 'ctx-menu';
    const head = document.createElement('div');
    head.className = 'ctx-head';
    head.textContent = I18n.t('aiSkillsTitle');
    menu.appendChild(head);
    const skills = (typeof Agents !== 'undefined' && Agents.allSkills) ? Agents.allSkills() : [];
    if (!skills.length) {
      const empty = document.createElement('div');
      empty.className = 'ctx-empty';
      empty.textContent = '\u2014';
      menu.appendChild(empty);
    }
    skills.forEach((sk) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ctx-item';
      const ico = document.createElement('span');
      ico.className = 'ctx-ico mono';
      ico.textContent = sk.icon || '\u2726';
      const lbl = document.createElement('span');
      lbl.textContent = sk.name || sk.id;
      item.appendChild(ico);
      item.appendChild(lbl);
      item.onclick = () => { this.closeSkillCtxMenu(); this.runSkillOnSelection(sk, this._selText); };
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';
    setTimeout(() => {
      this._ctxCloser = (ev) => { if (menu.contains(ev.target)) return; this.closeSkillCtxMenu(); };
      document.addEventListener('mousedown', this._ctxCloser);
      this._ctxEsc = (ev) => { if (ev.key === 'Escape') this.closeSkillCtxMenu(); };
      document.addEventListener('keydown', this._ctxEsc);
    }, 0);
  },

  closeSkillCtxMenu() {
    const m = document.getElementById('skillCtxMenu');
    if (m) m.remove();
    if (this._ctxCloser) { document.removeEventListener('mousedown', this._ctxCloser); this._ctxCloser = null; }
    if (this._ctxEsc) { document.removeEventListener('keydown', this._ctxEsc); this._ctxEsc = null; }
  },

  openRunModal(skill) {
    this.closeRunModal();
    const ov = document.createElement('div');
    ov.id = 'skillRunModal';
    ov.className = 'run-overlay';
    ov.innerHTML = `
      <div class="run-panel" role="dialog" aria-modal="true">
        <div class="run-head"><span class="run-ico mono">${esc(skill.icon || '\u2726')}</span><span class="run-title">${esc(skill.name || skill.id)}</span></div>
        <div class="run-progress">
          <div class="run-stage">${esc(I18n.t('runPreparing'))}</div>
          <div class="run-track"><div class="run-fill"></div></div>
        </div>
        <div class="run-result hidden"></div>
        <div class="run-kb-choose hidden">
          <label class="run-kb-row"><span>${esc(I18n.t('chooseKb'))}</span><select id="runKbSelect"></select></label>
          <div class="run-kb-acts">
            <button class="primary" id="btnKbInsertOk">${esc(I18n.t('confirmInsert'))}</button>
            <button class="ghost-btn" id="btnKbInsertCancel">${esc(I18n.t('cancelInsert'))}</button>
          </div>
        </div>
        <div class="run-actions hidden">
          <button class="ghost-btn" id="btnRunSaveNotes">${esc(I18n.t('saveToNotes'))}</button>
          <button class="ghost-btn" id="btnRunInsertKb">${esc(I18n.t('insertToKb'))}</button>
          <button class="ghost-btn" id="btnRunMargin">${esc(I18n.t('marginNote'))}</button>
          <button class="primary run-close" id="btnRunClose">${esc(I18n.t('runClose'))}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#btnRunClose').onclick = () => this.closeRunModal();
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closeRunModal(); });
    return ov;
  },

  closeRunModal() {
    const m = document.getElementById('skillRunModal');
    if (m) m.remove();
  },

  async runSkillOnSelection(skill, selText) {
    if (!skill || !selText) { this.toast(I18n.t('selFirst')); return; }
    this._selText = selText;
    const modal = this.openRunModal(skill);
    const stage = modal.querySelector('.run-stage');
    const fill = modal.querySelector('.run-fill');
    let pct = 4;
    const tick = setInterval(() => {
      pct = Math.min(90, pct + 4);
      fill.style.width = pct + '%';
      stage.textContent = pct > 50 ? I18n.t('runExecuting') : I18n.t('runPreparing');
    }, 180);

    const agent = (typeof Agents !== 'undefined' && Agents.get)
      ? (Agents.get(skill.agent) || Agents.get(Agents.current) || Agents.list()[0] || null)
      : null;
    const kbRes = Retrieval.extractiveAnswer(selText, { topK: 6 });
    const llmBase = Agents.activeLlm();
    const llm = skill.model ? Object.assign({}, llmBase, { model: skill.model }) : llmBase;
    const brief = skill.instructions ? (skill.instructions + '\n\n' + selText) : selText;
    let result;
    if (llm.apiKey && llm.baseUrl) {
      result = await Agents.llmRun(agent, { message: brief }, brief, kbRes, []);
    } else {
      result = Agents.extractiveRun(agent, { message: brief }, kbRes, []);
    }

    clearInterval(tick);
    fill.style.width = '100%';
    stage.textContent = I18n.t('runDone');
    this._skillResult = result.markdown || '';
    setTimeout(() => this.showRunResult(result.markdown || ''), 250);
    return result;
  },

  showRunResult(markdown) {
    const modal = document.getElementById('skillRunModal');
    if (!modal) return;
    modal.querySelector('.run-progress').classList.add('hidden');
    const box = modal.querySelector('.run-result');
    box.classList.remove('hidden');
    box.innerHTML = '';
    box.appendChild(renderMarkdown(markdown));
    const acts = modal.querySelector('.run-actions');
    acts.classList.remove('hidden');

    modal.querySelector('#btnRunSaveNotes').onclick = async () => {
      await window.daaix.notesSave({ id: 'note-' + Date.now(), markdown, modified: Date.now() });
      this.toast(I18n.t('noteSaved') + ' \u2713');
    };

    const chooser = modal.querySelector('.run-kb-choose');
    const chooseBtn = modal.querySelector('#btnRunInsertKb');
    chooseBtn.onclick = () => {
      if (!chooser.classList.contains('hidden')) { chooser.classList.add('hidden'); return; }
      const sel = modal.querySelector('#runKbSelect');
      sel.innerHTML = '';
      KB.kbs.filter(kb => this.kbIsOn(kb.id)).forEach(kb => {
        const o = document.createElement('option');
        o.value = kb.id;
        o.textContent = (kb.name && (kb.name.ar || kb.name.en)) || kb.id;
        sel.appendChild(o);
      });
      chooser.classList.remove('hidden');
      modal.querySelector('#btnKbInsertOk').onclick = () => this.insertSkillToKb(sel.value);
      modal.querySelector('#btnKbInsertCancel').onclick = () => chooser.classList.add('hidden');
    };

    modal.querySelector('#btnRunMargin').onclick = () => {
      this.addMarginNote(markdown);
      this.toast(I18n.t('marginAdded') + ' \u2713');
      this.closeRunModal();
    };
  },

  async insertSkillToKb(kbId) {
    const kb = (KB.kbs || []).find(k => k.id === kbId);
    if (!kb || !this._skillResult) return;
    kb.documents = kb.documents || [];
    kb.documents.push({
      id: 'doc-' + Date.now(),
      title: { ar: I18n.t('insertedDoc') || '\u0645\u0646 \u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a', en: 'From skills' },
      type: 'principle',
      body: this._skillResult
    });
    KB.rebuild();
    Retrieval.build();
    await window.daaix.kbSaveDownloaded(kb);
    this.renderAll();
    this.closeRunModal();
    this.toast(I18n.t('insertedInKb') + ' \u2713');
  },

  addMarginNote(markdown) {
    const body = document.getElementById('docBody');
    if (!body) return;
    const span = document.createElement('span');
    span.className = 'wiki-note';
    span.setAttribute('data-note', String(markdown || '').replace(/\s+/g, ' ').trim().slice(0, 400));
    span.textContent = String(this._selText || '').trim().slice(0, 80) || (I18n.t('marginNote'));
    const range = this._selRange;
    if (range && range.startContainer && body.contains(range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer)) {
      try {
        const frag = range.extractContents();
        span.textContent = '';
        span.appendChild(frag);
        range.insertNode(span);
        range.collapse(false);
      } catch (e) {
        try { range.insertNode(span); } catch (e2) { body.appendChild(span); }
      }
    } else {
      body.appendChild(span);
    }
    return span;
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
      const name = p.name.en || p.name.ar;
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
    if (agentList) {
      agentList.innerHTML = '';
      agentList.classList.add('hidden');
    }

    this.renderCustomSkillBuilder();
    this.renderCustomSkillList();

    const skillList = document.getElementById('skillList');
    skillList.innerHTML = '';
    const hiddenBuiltins = this.settings.hiddenBuiltinSkills || [];
    Agents.skills().filter(sk => !hiddenBuiltins.includes(sk.id)).forEach(sk => {
      const label = sk.label.en;
      const desc = sk.desc.en || sk.desc.ar;
      const prompt = sk.prompt.en || sk.prompt.ar;
      const row = document.createElement('div');
      row.className = 'cmd-item';
      row.innerHTML = `
        <span class="cmd-icon">${sk.icon}</span>
        <div class="cmd-main">
          <div class="cmd-name">@ ${esc(label)}</div>
          <div class="cmd-desc">${esc(desc)}</div>
        </div>
        <button class="ghost-btn cmd-run">${I18n.t('run')}</button>
        <button class="ghost-btn skill-edit" title="${esc(I18n.t('editSkill'))}">\u270e</button>
        <button class="ghost-btn skill-hide" title="${esc(I18n.t('hideSkill'))}">\u2715</button>`;
      row.querySelector('.cmd-run').onclick = () => {
        Agents.open(sk.agent);
        document.getElementById('agentInput').value = '@' + sk.label.en + ' ' + prompt;
        document.getElementById('agentInput').focus();
      };
      row.querySelector('.skill-edit').onclick = () => {
        this._editingSkillId = null;
        this.fillSkillBuilder({
          name: sk.label.en,
          agent: sk.agent,
          model: '',
          description: desc,
          instructions: prompt
        });
        this.toast(I18n.t('editSkill') + ' \u2014 ' + I18n.t('skillUpdate'));
      };
      row.querySelector('.skill-hide').onclick = async () => {
        this.settings.hiddenBuiltinSkills = (this.settings.hiddenBuiltinSkills || []).concat([sk.id]);
        await window.daaix.settingsSet({ hiddenBuiltinSkills: this.settings.hiddenBuiltinSkills });
        this.renderAiSettings();
      };
      skillList.appendChild(row);
    });

    /* v1.6.31: OCR engine lives with the agents — settings here, not inside the tool body */
    const ocrSec = document.createElement('div');
    ocrSec.className = 'cmd-item';
    const curOcrId = this.settings.ocrAgentId || '';
    const ocrAgentOpts = Agents.list().map(a => `<option value="agent:${esc(a.id)}"${curOcrId === ('agent:' + a.id) ? ' selected' : ''}>${esc(a.icon + ' ' + ((I18n.lang === 'ar') ? a.label.ar : a.label.en))}</option>`).join('');
    const ocrSkillOpts = Agents.allSkills().filter(sk => sk.model).map(sk => `<option value="sk:${esc(sk.id)}"${curOcrId === ('sk:' + sk.id) ? ' selected' : ''}>\u2728 ${esc(sk.name)} \u2014 ${esc(sk.model)}</option>`).join('');
    ocrSec.innerHTML = `
      <div class="cmd-main" style="flex:1">
        <div class="cmd-name">\ud83d\udcf7 ${esc(I18n.t('toolOcr'))} \u2014 ${esc(I18n.t('ocrAgent'))}</div>
        <select id="ocrAgent" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 10px;outline:none;margin-top:4px">
          <option value=""${curOcrId ? '' : ' selected'}>\u2014 ${esc(I18n.t('ocrAgentGeneric'))}</option>
          ${ocrAgentOpts}${ocrSkillOpts}
        </select>
        <input id="ocrModel" placeholder="gpt-4o / gemini / qwen-vl\u2026" value="${esc(this.settings.ocrModel || '')}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 10px;outline:none;margin-top:8px" />
        <div id="ocrAgentInfo" class="cmd-desc" style="margin-top:6px">${esc(I18n.t('ocrAgentInfo'))}</div>
      </div>`;
    ocrSec.querySelector('#ocrAgent').onchange = async (e) => {
      const v = e.target.value;
      this.settings.ocrAgentId = v;
      await window.daaix.settingsSet({ ocrAgentId: v });
      const info = ocrSec.querySelector('#ocrAgentInfo');
      const mdl = ocrSec.querySelector('#ocrModel');
      if (v.indexOf('sk:') === 0) {
        const sk = Agents.skillById(v.slice(3));
        if (sk && sk.model && mdl.value !== sk.model) {
          mdl.value = sk.model;
          this.settings.ocrModel = sk.model;
          await window.daaix.settingsSet({ ocrModel: sk.model });
        }
        info.textContent = sk ? (sk.name + ' \u2014 ' + sk.model) : '';
      } else if (v.indexOf('agent:') === 0) {
        const a = Agents.list().find(x => x.id === v.slice(6));
        info.textContent = a ? (((I18n.lang === 'ar') ? a.label.ar : a.label.en) + ' \u2014 ' + (this.settings.ocrModel || ((window.daaixSettings || {}).llm || {}).model || '')) : '';
      } else {
        info.textContent = I18n.t('ocrAgentInfo');
      }
    };
    ocrSec.querySelector('#ocrModel').onchange = async (e) => {
      const v = e.target.value.trim();
      this.settings.ocrModel = v;
      await window.daaix.settingsSet({ ocrModel: v });
    };
    skillList.parentNode.insertBefore(ocrSec, skillList.nextSibling);

    const memList = document.getElementById('memoryList');
    if (memList) {
      memList.innerHTML = '';
      const mem = Agents.assistantMemory();
      /* v1.6.25: memory switches + max-recent control (10-50) */
      const ctl = document.createElement('div');
      ctl.className = 'mem-ctl';
      ctl.innerHTML = `
        <label class="switch"><input type="checkbox" id="memRecentOn" ${mem.recent ? 'checked' : ''} /><span class="sl"></span></label>
        <span class="mem-ctl-label">${esc(I18n.t('memRecent'))}</span>
        <label class="switch"><input type="checkbox" id="memSavedOn" ${mem.saved ? 'checked' : ''} /><span class="sl"></span></label>
        <span class="mem-ctl-label">${esc(I18n.t('memSavedList'))}</span>
        <input type="number" id="memMaxRecent" min="10" max="50" value="${mem.maxRecent || 30}" title="${esc(I18n.t('memMaxRecent'))}" />`;
      ctl.querySelector('#memRecentOn').onchange = async (e) => {
        mem.recent = e.target.checked;
        await window.daaix.settingsSet({ assistantMemory: mem });
      };
      ctl.querySelector('#memSavedOn').onchange = async (e) => {
        mem.saved = e.target.checked;
        await window.daaix.settingsSet({ assistantMemory: mem });
      };
      ctl.querySelector('#memMaxRecent').onchange = async (e) => {
        const v = Math.max(10, Math.min(50, parseInt(e.target.value, 10) || 30));
        e.target.value = v;
        mem.maxRecent = v;
        await window.daaix.settingsSet({ assistantMemory: mem });
      };
      memList.appendChild(ctl);
      const sec = (title, arr, key) => {
        if (!arr || !arr.length) return;
        const h = document.createElement('div');
        h.className = 'cmd-name';
        h.style.padding = '8px 2px 2px';
        h.textContent = title;
        memList.appendChild(h);
        arr.forEach(r => {
          const row = document.createElement('div');
          row.className = 'cmd-item';
          row.innerHTML = `<div class="cmd-main"><div class="cmd-name">${esc(r.title || '')}</div><div class="cmd-desc">${esc(r.summary || r.text || '')}</div></div>`;
          const del = document.createElement('button');
          del.className = 'ghost-btn';
          del.textContent = I18n.t('memDelete');
          del.onclick = async () => {
            const m = Agents.assistantMemory();
            m[key] = (m[key] || []).filter(x => x !== r);
            await window.daaix.settingsSet({ assistantMemory: m });
            this.renderAiSettings();
          };
          row.appendChild(del);
          memList.appendChild(row);
        });
      };
      sec(I18n.t('memRecent'), mem.recentList, 'recentList');
      sec(I18n.t('memSavedList'), mem.savedList, 'savedList');
      if (!memList.children.length) memList.innerHTML = `<p class="hint">\u2014</p>`;
    }
  },

  fillSkillBuilder(sk) {
    const wrap = document.getElementById('customSkillBuilder');
    if (!wrap) return;
    wrap.querySelector('#skillNameInput').value = sk.name || '';
    if (sk.agent) wrap.querySelector('#skillAgentSelect').value = sk.agent;
    wrap.querySelector('#skillModelInput').value = sk.model || '';
    wrap.querySelector('#skillDescInput').value = sk.description || '';
    wrap.querySelector('#skillInstrInput').value = sk.instructions || '';
    wrap.querySelector('#skillAutoInput').value = sk.automation || '';
    const btn = wrap.querySelector('#btnAddSkill');
    if (btn) btn.textContent = this._editingSkillId ? I18n.t('skillUpdate') : I18n.t('addSkill');
  },

  renderCustomSkillBuilder() {
    const wrap = document.getElementById('customSkillBuilder');
    if (!wrap) return;
    const agentOpts = Agents.list().map(a => `<option value="${esc(a.id)}">${esc(a.label.en || a.label.ar)}</option>`).join('');
    wrap.innerHTML = `
      <div class="skill-builder">
        <input id="skillNameInput" type="text" placeholder="${esc(I18n.t('skillName'))}" />
        <select id="skillAgentSelect">${agentOpts}</select>
        <input id="skillModelInput" type="text" list="modelPresets" placeholder="${esc(I18n.t('skillModel'))}" />
        <input id="skillDescInput" type="text" placeholder="${esc(I18n.t('skillDescription'))}" />
        <input id="skillInstrInput" type="text" placeholder="${esc(I18n.t('skillInstructions'))}" />
        <input id="skillAutoInput" type="text" placeholder="${esc(I18n.t('skillAutomation'))}" />
        <button id="btnAddSkill" class="ghost-btn">${I18n.t('addSkill')}</button>
        <button id="btnImportSkill" class="ghost-btn">${I18n.t('importSkill')}</button>
      </div>`;
    wrap.querySelector('#btnAddSkill').onclick = async () => {
      const name = wrap.querySelector('#skillNameInput').value.trim();
      if (!name) { this.toast(I18n.t('skillName')); return; }
      const vals = {
        name,
        agent: wrap.querySelector('#skillAgentSelect').value,
        model: wrap.querySelector('#skillModelInput').value.trim(),
        description: wrap.querySelector('#skillDescInput').value.trim(),
        instructions: wrap.querySelector('#skillInstrInput').value.trim(),
        automation: wrap.querySelector('#skillAutoInput').value.trim()
      };
      this.settings.customSkills = this.settings.customSkills || [];
      if (this._editingSkillId) {
        const i = this.settings.customSkills.findIndex(x => x.id === this._editingSkillId);
        if (i >= 0) this.settings.customSkills[i] = Object.assign({ id: this._editingSkillId }, vals);
        else this.settings.customSkills.push(Object.assign({ id: 'skill-' + Date.now() }, vals));
        this._editingSkillId = null;
      } else {
        this.settings.customSkills.push(Object.assign({ id: 'skill-' + Date.now() }, vals));
      }
      await window.daaix.settingsSet({ customSkills: this.settings.customSkills });
      this.renderAiSettings();
      this.toast(I18n.t('addSkill') + ' \u2713');
    };
    wrap.querySelector('#btnImportSkill').onclick = async () => {
      const res = await window.daaix.skillImport();
      if (!res || !res.ok) return;
      const sk = Agents.skillFromMarkdown(res.markdown);
      if (!sk.name) { this.toast(I18n.t('skillBadFile')); return; }
      this.settings.customSkills = this.settings.customSkills || [];
      this.settings.customSkills.push({
        id: 'skill-' + Date.now(),
        name: sk.name,
        agent: wrap.querySelector('#skillAgentSelect').value,
        model: wrap.querySelector('#skillModelInput').value.trim(),
        description: sk.description,
        instructions: sk.instructions
      });
      await window.daaix.settingsSet({ customSkills: this.settings.customSkills });
      this.renderAiSettings();
      this.toast(I18n.t('skillImported') + ' \u2713');
    };
  },

  renderCustomSkillList() {
    const list = document.getElementById('customSkillList');
    if (!list) return;
    list.innerHTML = '';
    (this.settings.customSkills || []).forEach(sk => {
      const agent = Agents.get(sk.agent);
      const row = document.createElement('div');
      row.className = 'cmd-item';
      row.innerHTML = `
        <span class="cmd-icon">✨</span>
        <div class="cmd-main">
          <div class="cmd-name">@ ${esc(sk.name)}</div>
          <div class="cmd-desc">${esc((agent && agent.label.en) || '')}${sk.model ? ' · ' + esc(sk.model) : ''}${sk.description ? ' · ' + esc(sk.description) : ''}</div>
        </div>
        <button class="ghost-btn skill-edit" title="${esc(I18n.t('editSkill'))}">✎</button>
        <button class="ghost-btn skill-export" title="${esc(I18n.t('exportSkill'))}">⤵</button>
        <button class="ghost-btn skill-del">✕</button>`;
      row.querySelector('.skill-edit').onclick = () => {
        this._editingSkillId = sk.id;
        this.fillSkillBuilder(sk);
        this.toast(I18n.t('skillUpdate'));
      };
      row.querySelector('.skill-export').onclick = async () => {
        const r = await window.daaix.skillExport(sk.name, Agents.skillToMarkdown(sk));
        if (r && r.ok) this.toast(I18n.t('skillExported') + ' ✓');
      };
      row.querySelector('.skill-del').onclick = async () => {
        this.settings.customSkills = (this.settings.customSkills || []).filter(x => x.id !== sk.id);
        await window.daaix.settingsSet({ customSkills: this.settings.customSkills });
        this.renderAiSettings();
      };
      list.appendChild(row);
    });
  },

  fillSettings() {
    document.getElementById('setLang').value = I18n.lang;
    document.getElementById('setTheme').value = this.settings.theme || 'dark';
    document.getElementById('setFontFam').value = this.settings.fontFam || '';
    document.getElementById('setFontSize').value = parseInt(this.settings.fontSize, 10) || 16;
    document.getElementById('setFontColor').value = this.settings.fontColor || '#e6edf7';
    this.fillReadingStyle();
    this.fillTypography();
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
      const wrap = document.createElement('div');
      wrap.className = 'connector-wrap';
      const row = document.createElement('div');
      row.className = 'connector-row';
      row.innerHTML = `
        <input type="text" data-c="name" placeholder="${I18n.t('connectorName')}" value="${esc(c.name || '')}" />
        <input type="url" data-c="url" placeholder="${I18n.t('connectorUrl')}" value="${esc(c.url || '')}" />
        <input type="number" data-c="interval" min="5" step="5" title="${I18n.t('connInterval')}" value="${Math.max(5, parseInt(c.interval, 10) || 30)}" />
        <input type="password" data-c="apiKey" placeholder="${I18n.t('apiKey')}" value="${esc(c.apiKey || '')}" autocomplete="off" />
        <label class="check-item"><input type="checkbox" data-c="enabled" ${c.enabled !== false ? 'checked' : ''} /></label>
        <button class="ghost-btn conn-check" title="${I18n.t('connCheckNow')}">⟳ ${I18n.t('connCheckNow')}</button>
        <button class="danger conn-del">✕</button>`;
      row.querySelector('.conn-del').onclick = () => {
        this.settings.connectors.splice(idx, 1);
        this.renderConnectors();
      };
      row.querySelector('.conn-check').onclick = () => this.checkConnector(idx);
      wrap.appendChild(row);
      /* v1.6.31: watched items found on the page, newest first */
      const itemsBox = document.createElement('div');
      itemsBox.className = 'conn-items';
      const items = (c.items || []).slice().sort((a, b) => String(b.foundAt || '').localeCompare(String(a.foundAt || '')));
      if (items.length) {
        items.slice(0, 50).forEach(it => {
          const li = document.createElement('div');
          li.className = 'conn-item';
          const d = it.foundAt ? new Date(it.foundAt) : null;
          li.innerHTML = `<span class="conn-item-title" title="${esc(it.title || '')}">${esc(it.title || '')}</span>` +
            `<span class="conn-item-date">${d ? d.toLocaleDateString() : ''}</span>`;
          li.title = it.title || '';
          li.style.cursor = 'pointer';
          li.onclick = () => window.daaix.openExternal(it.link);
          itemsBox.appendChild(li);
        });
      } else {
        itemsBox.innerHTML = `<div class="conn-item conn-empty">${I18n.t('connNoItems')}</div>`;
      }
      wrap.appendChild(itemsBox);
      list.appendChild(wrap);
    });
  },

  readConnectors() {
    const rows = [...document.querySelectorAll('#connectorList .connector-row')];
    const old = this.settings.connectors || [];
    return rows.map((row, i) => {
      const prev = old[i] || {};
      return {
        name: row.querySelector('[data-c=name]').value.trim(),
        url: row.querySelector('[data-c=url]').value.trim(),
        apiKey: row.querySelector('[data-c=apiKey]').value.trim(),
        enabled: row.querySelector('[data-c=enabled]').checked,
        interval: Math.max(5, parseInt(row.querySelector('[data-c=interval]').value, 10) || 30),
        lastCheck: prev.lastCheck || '',
        items: prev.items || []
      };
    }).filter(c => c.url);
  },

  /* ---------- v1.6.31: watched connectors — periodic re-check for new items ---------- */
  async checkConnector(idx) {
    const c = (this.settings.connectors || [])[idx];
    if (!c || !c.url) return Promise.resolve();
    const res = await window.daaix.netGetText(c.url);
    if (!res || !res.ok) {
      this.toast(I18n.t('connCheckNow') + ' ✕ — ' + ((res && res.error) || ''));
      return;
    }
    const items = this.extractPageItems(res.text, c.url);
    const known = new Set((c.items || []).map(x => x.link));
    let added = 0;
    (items || []).forEach(it => {
      if (it.link && !known.has(it.link)) { (c.items = c.items || []).push(it); known.add(it.link); added++; }
    });
    c.items = (c.items || []).slice(-200);
    c.lastCheck = new Date().toISOString();
    this.settings.connectors = this.settings.connectors || [];
    await window.daaix.settingsSet({ connectors: this.settings.connectors });
    this.renderConnectors();
    this.toast(I18n.t('connNewFound') + ': ' + added);
  },

  extractPageItems(html, baseUrl) {
    const out = [];
    const seen = new Set();
    const push = (title, link) => {
      if (seen.has(link) || out.length >= 100) return;
      seen.add(link);
      out.push({ title: String(title || '').slice(0, 140), link, foundAt: new Date().toISOString() });
    };
    let host = '';
    try { host = new URL(baseUrl).host; } catch (_) { return out; }
    try {
      const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      [...doc.querySelectorAll('a[href]')].forEach(a => {
        const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
        const href = a.getAttribute('href') || '';
        if (text.length < 8 || href.charAt(0) === '#' || /^(mailto|javascript):/i.test(href)) return;
        let abs = '';
        try { abs = new URL(href, baseUrl).href; } catch (_) { return; }
        if (!/^https?:\/\//i.test(abs)) return;
        try { if (new URL(abs).host !== host) return; } catch (_) { return; }
        push(text, abs);
      });
    } catch (_) { /* fall through to regex */ }
    if (!out.length) {
      String(html || '').replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{5,200}?)<\/a>/gi, (m, href, t) => {
        const text = String(t).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (text.length < 8) return m;
        let abs = '';
        try { abs = new URL(href, baseUrl).href; } catch (_) { return m; }
        if (!/^https?:\/\//i.test(abs)) return m;
        try { if (new URL(abs).host !== host) return m; } catch (_) { return m; }
        push(text, abs);
        return m;
      });
    }
    return out;
  },

  async autoCheckConnectors() {
    if (this._connChecking) return;
    const cs = this.settings.connectors || [];
    const now = Date.now();
    const due = [];
    cs.forEach((c, idx) => {
      if (c.enabled === false || !c.url) return;
      const iv = Math.max(5, parseInt(c.interval, 10) || 30) * 60000;
      const last = c.lastCheck ? (Date.parse(c.lastCheck) || 0) : 0;
      if (now - last >= iv) due.push(idx);
    });
    if (!due.length) return;
    this._connChecking = true;
    try { for (const i of due) await this.checkConnector(i); } finally { this._connChecking = false; }
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
      /* v1.6.42: feed items open inside the current window with history */
      card.onclick = () => this.navInTab({ kind: 'doc', docId: it.doc.id });
      feed.appendChild(card);
    });
  },


  /* ---------- search: textual + semantic modes, detailed result cards ---------- */
  searchMode: 'text',
  searchCat: 'all',

  setSearchMode(mode) {
    this.searchMode = mode;
    const btn = document.getElementById('btnSearchMode');
    if (btn) btn.innerHTML = LENS_SVG;
    document.getElementById('searchModeMenu').classList.add('hidden');
    const q = document.getElementById('globalSearch').value;
    if (q && q.trim().length >= 2) this.search(q);
  },

  renderSearchModeMenu() {
    const menu = document.getElementById('searchModeMenu');
    menu.innerHTML = '';
    [
      ['text', '\u2315', 'searchTextTitle'],
      ['semantic', '\u2727', 'searchSemanticTitle']
    ].forEach(([m, icon, key]) => {
      const b = document.createElement('button');
      b.className = 'kb-menu-item' + (this.searchMode === m ? ' active-mode' : '');
      b.textContent = `${icon} ${I18n.t(key)}${this.searchMode === m ? ' \u2713' : ''}`;
      b.onclick = () => this.setSearchMode(m);
      menu.appendChild(b);
    });
  },

  search(q) {
    /* v1.6.42: search now acts on the CURRENT page — results open in a top-level
       dropdown instead of forcing a jump back to the home window. */
    const box = document.getElementById('searchResults');
    const feed = document.getElementById('updatesFeed');
    const feedHead = document.getElementById('feedHead');
    const query = (q || '').trim();
    if (query !== this._lastQuery) { this.searchCat = 'all'; this._lastQuery = query; }
    const active = query.length >= 2;
    const onHome = this.activeTab === 'home';
    feed.classList.toggle('hidden', onHome && !!active);
    if (feedHead) feedHead.classList.toggle('hidden', onHome && !!active);
    box.innerHTML = '';
    box.classList.toggle('hidden', !active);
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
        <div class="sr-top"><div class="t">${esc(title)}</div><span class="chip type t-${doc.type}">${I18n.docTypeName(doc.type)}</span>${r.articleNum ? `<span class="chip art">${esc(I18n.t('articleChip'))} ${esc(r.articleNum)}</span>` : ''}</div>
        ${r.excerptHtml ? `<div class="sr-snippet">${r.excerptHtml}</div>` : (r.snippet ? `<div class="sr-snippet">${esc(r.snippet)}</div>` : '')}
        <a class="sr-open" href="#">${I18n.t('viewDetails')} ←</a>
        <div class="sr-props">
          <div><span>${I18n.t('docType')}:</span> ${I18n.docTypeName(doc.type)}</div>
          <div><span>${I18n.t('issueTool')}:</span> ${esc(issueTool)}</div>
          <div><span>${I18n.t('docNumber')}:</span> ${esc(doc.issueTool ? doc.issueTool.number : (doc.number || '—'))}</div>
          <div><span>${I18n.t('issueToolDate')}:</span> ${esc(doc.issueTool ? doc.issueTool.date : (doc.date || '—'))}</div>
          <div><span>${I18n.t('legislativeStatus')}:</span> ${I18n.t('status_' + (doc.status || 'in_force'))}</div>
        </div>`;
      const open = () => {
        const box2 = document.getElementById('searchResults');
        if (box2) box2.classList.add('hidden');
        document.getElementById('globalSearch').value = '';
        this.search(''); this._lastQuery = '';
        /* v1.6.42: pick a result → the CURRENT page becomes the document (back ‹ returns) */
        this.navInTab({ kind: 'doc', docId: doc.id });
        if (r.articleNum) setTimeout(() => this.scrollToArticle(r.articleNum), 80);
      };
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
        if (btn.dataset.tab !== 'chat' && document.body.classList.contains('chat-expanded')) {
          document.body.classList.remove('chat-expanded');
          const ex = document.getElementById('docChatExpand');
          if (ex) ex.textContent = '\u2922';
        }
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
    /* v1.6.36: resizable TOC / props columns + props collapse toggle */
    this.bindResizeCol(document.getElementById('tocSplit'), document.getElementById('docToc'), 180, 420, 1, 'tocW');
    this.bindResizeCol(document.getElementById('propsSplit'), document.getElementById('docProps'), 240, 480, -1, 'propsW');
    document.getElementById('btnPropsToggle').onclick = () => {
      const props = document.getElementById('docProps');
      const collapsed = props.classList.toggle('collapsed');
      this.settings.propsCollapsed = collapsed;
      window.daaix.settingsSet({ propsCollapsed: collapsed });
      document.getElementById('btnPropsToggle').textContent = collapsed ? '❮' : '❯';
    };
    this.applyColumnWidths();
    document.getElementById('docChatSend').onclick = () => this.sendDocChat();
    document.getElementById('docChatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendDocChat(); }
    });
    document.getElementById('docChatInput').addEventListener('input', (e) => {
      document.getElementById('docChatSend').classList.toggle('ready', !!e.target.value.trim());
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
      Agents.wireCites(aEl, res.passages);
    }
    if (res.passages && res.passages.length) {
      const cites = document.createElement('div');
      cites.className = 'chat-cites';
      res.passages.forEach(p => {
        const a = document.createElement('a');
        a.textContent = p.docTitle + (p.articleNum ? ' (' + p.articleNum + ')' : '');
        a.onclick = () => this.navInTab({ kind: 'doc', docId: p.docId });
        cites.appendChild(a);
      });
      aEl.appendChild(cites);
    }
    log.appendChild(aEl);
    log.scrollTop = log.scrollHeight;
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

  openTab(t, opts) {
    if (!(opts && opts.forceNew)) {
      const existing = this.tabs.find(x => x.kind === t.kind && x.docId === t.docId && x.toolId === t.toolId);
      if (existing) return this.activateTab(existing.id);
    }
    if (this.tabs.length >= 10) { this.toast(I18n.t('tabsMax')); return; }
    t.id = 'tab-' + (++this._tabSeq);
    t.hist = [{ kind: t.kind, docId: t.docId, toolId: t.toolId }];
    t.hIdx = 0;
    this.tabs.push(t);
    this.activateTab(t.id);
  },

  /* v1.6.42: shared "go home" — open home view like any page, honoring history */
  goHome() {
    const cur = this.tabs.find(x => x.id === this.activeTab);
    const homeTab = this.tabs.find(x => x.kind === 'home');
    if (homeTab) return this.activateTab(homeTab.id);
    if (cur) this.navInTab({ kind: 'home', docId: undefined, toolId: undefined });
    else this.openTab({ kind: 'home' });
  },

  closeTab(id) {
    const homeTab = this.tabs.find(x => x.id === id);
    if (homeTab && id === 'home' && homeTab.kind === 'home') return;
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
    this.renderView(t);
  },

  renderView(t) {
    if (t.kind === 'home') this.showView('home');
    else if (t.kind === 'doc') this.renderDocument(t.docId);
    else if (t.kind === 'agents') { this.showView('agents'); Agents.render(); }
    else if (t.kind === 'tools') { this.showView('tools'); Tools.active = t.toolId; Tools.renderMenu(); Tools.render(t.toolId); }
    else if (t.kind === 'notes') { this.showView('notes'); Notes.refresh(); }
    else if (t.kind === 'settings') this.showView('settings');
  },

  navInTab(view) {
    const t = this.tabs.find(x => x.id === this.activeTab);
    /* v1.6.42: every page — including home — navigates in place with history,
       so the back button ‹ always returns to the previous page (Obsidian-style). */
    if (!t) {
      if (view.kind === 'doc') this.openDocument(view.docId);
      return;
    }
    const cur = (t.hist && t.hist[t.hIdx]) || { kind: t.kind, docId: t.docId, toolId: t.toolId };
    if (t.hIdx === undefined) t.hIdx = 0;
    if (!t.hist) { t.hist = [cur]; t.hIdx = 0; }
    if (cur.kind === view.kind && cur.docId === view.docId && cur.toolId === view.toolId) {
      this.renderView(t);
      if (view.kind === 'doc' && view.article) this.scrollToArticle(view.article);
      return;
    }
    if (!t.hist.length) { t.hist = [cur]; t.hIdx = 0; }
    t.hist = t.hist.slice(0, t.hIdx + 1);
    t.hist.push({ kind: view.kind, docId: view.docId, toolId: view.toolId });
    t.hIdx = t.hist.length - 1;
    t.kind = view.kind; t.docId = view.docId; t.toolId = view.toolId;
    this.renderTabBar();
    this.renderView(t);
    if (view.kind === 'doc' && view.article) this.scrollToArticle(view.article);
  },

  scrollToArticle(articleNum) {
    const bodyEl = document.getElementById('docBody');
    if (!bodyEl || !articleNum) return;
    const target = String(articleNum);
    const cards = [...bodyEl.querySelectorAll('.article-card')];
    const card = cards.find(c => {
      const n = c.querySelector('.anum');
      return n && n.textContent.trim().startsWith(target);
    }) || cards.find(c => (c.textContent || '').includes(target));
    if (card) {
      card.classList.add('article-flash');
      card.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setTimeout(() => card.classList.remove('article-flash'), 1600);
    }
  },

  renderTabBar() {
    /* v1.6.42: the back/forward bar is ALWAYS visible — even with a single window. */
    const bar = document.getElementById('tabBar');
    if (!bar) return;
    bar.classList.remove('hidden');
    bar.innerHTML = '';
    const t = this.tabs.find(x => x.id === this.activeTab);
    const hist = (t && t.hist) || [];
    const hi = (t && t.hIdx) || 0;
    const prev = document.createElement('button');
    prev.className = 'tab-nav-btn'; prev.textContent = '\u2039'; prev.title = I18n.t('tabPrev');
    prev.disabled = hi <= 0;
    prev.onclick = (e) => { e.stopPropagation(); this.stepTab(-1); };
    const next = document.createElement('button');
    next.className = 'tab-nav-btn'; next.textContent = '\u203a'; next.title = I18n.t('tabNext');
    next.disabled = hi >= hist.length - 1;
    next.onclick = (e) => { e.stopPropagation(); this.stepTab(1); };
    bar.appendChild(prev); bar.appendChild(next);
    this.tabs.forEach(t => {
      const el = document.createElement('div');
      el.className = 'app-tab' + (t.id === this.activeTab ? ' active' : '');
      const span = document.createElement('span');
      span.className = 'tab-title';
      span.textContent = this.tabLabel(t);
      el.appendChild(span);
      if (!(t.id === 'home' && t.kind === 'home')) {
        const x = document.createElement('button');
        x.className = 'tab-close';
        x.textContent = '\u00d7';
        x.onclick = (e) => { e.stopPropagation(); this.closeTab(t.id); };
        el.appendChild(x);
      }
      el.onclick = () => this.activateTab(t.id);
      bar.appendChild(el);
    });
    const wrap = document.createElement('div');
    wrap.className = 'tab-plus-wrap';
    const plus = document.createElement('button');
    plus.className = 'tab-new-btn'; plus.textContent = '+'; plus.title = I18n.t('tabNewWindow');
    plus.onclick = (e) => {
      e.stopPropagation();
      this.openTab({ kind: 'home' }, { forceNew: true });
    };
    wrap.appendChild(plus);
    bar.appendChild(wrap);
  },

  stepTab(dir) {
    const t = this.tabs.find(x => x.id === this.activeTab);
    if (!t) return;
    const hist = t.hist || [];
    const ni = (t.hIdx || 0) + dir;
    if (ni < 0 || ni >= hist.length) return;
    t.hIdx = ni;
    Object.assign(t, hist[ni]);
    this.renderTabBar();
    this.renderView(t);
  },

  openDocument(id, forceNew) {
    this.openTab({ kind: 'doc', docId: id }, forceNew ? { forceNew: true } : undefined);
  },

  /* v1.6.36: new-tab launcher — activated tools, recent docs, inline KB search */
  renderHomeLauncher() {
    const toolsBox = document.getElementById('homeTools');
    if (!toolsBox) return;
    toolsBox.innerHTML = '';
    Tools.list().filter(t => this.toolIsOn(t.id)).forEach(t => {
      const row = document.createElement('button');
      row.className = 'home-tool';
      row.title = t.desc || '';
      row.innerHTML = `<span class="ht-icon mono">${t.icon}</span>` +
        `<span class="ht-main"><span class="ht-label">${esc(t.label)}</span>` +
        `<span class="ht-desc">${esc(t.desc || '')}</span></span>` +
        `<span class="ht-chip cat-chip ${t.cat}">${esc(I18n.t('cat_' + t.cat))}</span>`;
      row.onclick = () => this.openTab({ kind: 'tools', toolId: t.id }, { forceNew: true });
      toolsBox.appendChild(row);
    });
  },


  /* v1.6.36: resizable columns (Obsidian-style drag splitters) */
  bindResizeCol(handle, pane, min, max, sign, key) {
    if (!handle || !pane) return;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startX = e.clientX, startW = pane.getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging');
      const move = (ev) => {
        let w = Math.round(startW + sign * (ev.clientX - startX));
        w = Math.max(min, Math.min(max, w));
        pane.style.width = w + 'px';
        pane.style.minWidth = w + 'px'; pane.style.maxWidth = w + 'px';
      };
      const up = (ev) => {
        handle.classList.remove('dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        let w = Math.round(startW + sign * (ev.clientX - startX));
        w = Math.max(min, Math.min(max, w));
        this.settings[key] = w;
        window.daaix.settingsSet({ [key]: w });
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  },

  applyColumnWidths() {
    const toc = document.getElementById('docToc');
    const props = document.getElementById('docProps');
    if (toc) {
      const w = Math.max(180, Math.min(420, parseInt(this.settings.tocW, 10) || 250));
      toc.style.width = w + 'px'; toc.style.minWidth = w + 'px'; toc.style.maxWidth = w + 'px';
    }
    if (props) {
      const w = Math.max(240, Math.min(480, parseInt(this.settings.propsW, 10) || 255));
      props.style.width = w + 'px'; props.style.minWidth = w + 'px'; props.style.maxWidth = w + 'px';
    }
    if (props) props.classList.toggle('collapsed', this.settings.propsCollapsed === true);
    const btn = document.getElementById('btnPropsToggle');
    if (btn) btn.textContent = this.settings.propsCollapsed === true ? '\u276e' : '\u276f';
  },

  renderDocument(id) {
    const doc = KB.get(id);
    if (!doc) return;
    this.currentDocId = id;
    this.editing = false;
    const editBtn = document.getElementById('btnEditDoc');
    if (editBtn) { editBtn.textContent = '\u2298'; editBtn.title = I18n.t('editLockTitle'); }
    document.body.classList.remove('chat-expanded');
    const ex = document.getElementById('docChatExpand');
    if (ex) ex.textContent = '\u2922';
    this.docChatScope = [];
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
      badge.textContent = '\u270E ' + I18n.t('editedCopy');
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
    this.updateDocStats();
    document.getElementById('editBanner').classList.add('hidden');
  },

  updateDocStats() {
    const el = document.getElementById('docStats');
    if (!el) return;
    const bodyEl = document.getElementById('docBody');
    const txt = bodyEl ? (bodyEl.innerText || bodyEl.textContent || '').trim() : '';
    const words = txt ? txt.split(/\s+/).length : 0;
    const chars = txt.replace(/\s+/g, '').length;
    el.textContent = words + ' ' + I18n.t('wordsCount') + ' \u00b7 ' + chars + ' ' + I18n.t('charsCount');
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
    this.wrapReadingSections(bodyEl);
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
      item.onclick = () => this.navInTab({ kind: 'doc', docId: d.id });
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
      if (target) item.onclick = () => this.navInTab({ kind: 'doc', docId: targetId });
      wrap.appendChild(item);
    };
    outgoing.forEach(r => addRel(I18n.t('rel_' + r.type), r.target, r.note));
    incoming.forEach(r => {
      const label = r.type === 'cites' ? I18n.t('citedIn') : I18n.t('rel_' + r.type);
      addRel(label, r.sourceDoc.id, r.note);
    });
  },

  tocCollapsed: false,

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
      if (this.tocCollapsed) nodes = nodes.filter(n => n.level === 1).map(n => ({ ...n, children: [] }));
      nodes.forEach(n => {
        const item = document.createElement('div');
        item.className = 'toc-node';
        const row = document.createElement('div');
        row.className = 'toc-item lvl' + n.level;
        /* v1.6.38: unified chevron — same ❯ symbol as the column toggles;
           rotated down when the branch is open, right when folded */
        const tg = document.createElement('span');
        tg.className = 'toc-toggle' + (n.children.length ? ' rot' : ' leaf rot');
        tg.textContent = '\u276f';
        tg.onclick = (e) => {
          e.stopPropagation();
          if (!n.children.length) return;
          const collapsed = kids.classList.toggle('collapsed');
          tg.classList.toggle('folded', collapsed);
        };
        row.appendChild(tg);
        const label = document.createElement('span');
        label.className = 'toc-label';
        label.textContent = n.el.textContent.slice(0, 80);
        label.onclick = () => {
          const det = n.el.closest('details.deep-fold');
          if (det) det.open = true;
          n.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
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
    const btn = document.getElementById('btnEditDoc');
    this.editing = !this.editing;
    bodyEl.contentEditable = this.editing ? 'true' : 'false';
    document.getElementById('docPaper').classList.toggle('editing', this.editing);
    banner.classList.toggle('hidden', !this.editing);
    btn.textContent = this.editing ? '\u270E' : '\u2298';
    btn.title = I18n.t(this.editing ? 'editWriteTitle' : 'editLockTitle');
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
