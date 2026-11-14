'use strict';

const KB = {
  kbs: [],
  index: [],
  byId: new Map(),

  load(sample) {
    this.kbs = sample.kbs || [];
    this.rebuild();
  },

  addDownloaded(downloaded) {
    (downloaded || []).forEach(kb => {
      const i = this.kbs.findIndex(k => k.id === kb.id);
      if (i >= 0) this.kbs[i] = kb; else this.kbs.push(kb);
    });
    this.rebuild();
  },

  rebuild() {
    this.index = [];
    this.byId = new Map();
    this.kbs.forEach(kb => {
      (kb.documents || []).forEach((doc, di) => {
        doc.kbId = kb.id;
        while (this.byId.has(doc.id)) doc.id = doc.id + '-x' + di;
        this.byId.set(doc.id, doc);
        const text = this.docText(doc);
        const tokens = this.tokenize(text);
        const freq = new Map();
        for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
        this.index.push({
          doc,
          kbId: kb.id,
          kbName: kb.name,
          raw: text,
          text: text.toLowerCase(),
          tokens,
          tokenSet: new Set(tokens),
          tokenFreq: freq,
          titleNorm: this.tokenize((doc.title && (doc.title.ar || doc.title.en)) || '').join(' '),
          titleTokens: this.tokenize((doc.title && (doc.title.ar || doc.title.en)) || '')
        });
      });
    });
  },

  docText(doc) {
    const bi = o => o ? [o.ar, o.en].filter(Boolean).join(' ') : '';
    const parts = [
      bi(doc.title),
      bi(doc.summary),
      doc.body || '',
      (doc.articles || []).map(a => `${a.num || ''} ${bi(a.title)} ${a.text || ''}`).join('\n')
    ];
    return parts.filter(Boolean).join('\n');
  },

  tokenize(text) {
    const stop = new Set(['في','من','على','عن','إلى','الى','التي','الذي','هذا','هذه','ما','مع','أو','او','ثم','كل','بين','هو','هي','the','of','in','on','to','and','or','a','an','is','are','for','by','with']);
    return String(text).toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[^\u0600-\u06FF\u0041-\u007A\u0030-\u0039\u0660-\u0669]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stop.has(w))
      .map(w => w.replace(/^(ال|وال|بال|فال|لل)/, ''))
      .filter(w => w.length > 1);
  },

  matchScore(queryTokens, docTokens, pre) {
    const freq = pre && pre.tokenFreq;
    const set = pre && pre.tokenSet;
    let exact = 0, partial = 0;
    for (const q of queryTokens) {
      let hit = 0;
      if (freq && set) {
        if (freq.get(q)) hit = 1;
        else if (q.length >= 3) {
          for (const t of set) {
            if (t.includes(q) || q.includes(t)) { hit = 0.6; break; }
          }
        }
      } else {
        for (const t of docTokens) {
          if (t === q) { hit = 1; break; }
          if (q.length >= 3 && (t.includes(q) || q.includes(t))) hit = Math.max(hit, 0.6);
        }
      }
      if (hit === 1) exact++;
      else if (hit) partial++;
    }
    const ok = exact > 0 || partial >= 2 || (queryTokens.length === 1 && partial > 0);
    return { exact, partial, ok, total: exact + partial };
  },

  searchScore(entry, qTokens, phrase) {
    const titleNorm = entry.titleNorm != null ? entry.titleNorm
      : this.tokenize((entry.doc.title && (entry.doc.title.ar || entry.doc.title.en)) || '').join(' ');
    const titlePhrase = titleNorm.includes(phrase);
    const bodyPhrase = entry.text.includes(phrase);
    const m = this.matchScore(qTokens, entry.tokens, entry);
    const th = this.titleHits(qTokens, entry.doc, entry);
    if (!m.ok && !titlePhrase && !bodyPhrase) return null;
    let score = m.exact * 3 + m.partial * 0.5 + th * 2;
    if (titlePhrase) score += 100;
    if (bodyPhrase) score += 40;
    return { m, score, strong: m.exact > 0 || titlePhrase || bodyPhrase };
  },

  titleHits(qTokens, doc, entry) {
    const titleTokens = (entry && entry.titleTokens) || this.tokenize((doc.title && (doc.title.ar || doc.title.en)) || '');
    return qTokens.filter(q => titleTokens.some(t => t === q || (q.length >= 3 && (t.includes(q) || q.includes(t))))).length;
  },

  normalizeWord(w) {
    return String(w).toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/^(\u0627\u0644|\u0648\u0627\u0644|\u0628\u0627\u0644|\u0641\u0627\u0644|\u0644\u0644)/, '');
  },

  /* Excerpt that quotes the ACTUAL matched span: the full phrase when present,
     otherwise the densest run of query tokens, with 6 words of context each side. */
  makeExcerpt(raw, qTokens, pad = 6) {
    const text = String(raw || '');
    if (!text || !qTokens || !qTokens.length) return '';
    const re = /[\u0600-\u06FF\u0041-\u007A\u0030-\u0039\u0660-\u0669]+/g;
    const words = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      words.push({ start: m.index, end: m.index + m[0].length, norm: this.normalizeWord(m[0]) });
    }
    if (!words.length) return '';
    const stop = new Set(['\u0641\u064a','\u0645\u0646','\u0639\u0644\u0649','\u0639\u0646','\u0625\u0644\u0649','\u0627\u0644\u0649','\u0627\u0644\u062a\u064a','\u0627\u0644\u0630\u064a','\u0647\u0630\u0627','\u0647\u0630\u0647','\u0645\u0627','\u0645\u0639','\u0623\u0648','\u0627\u0648','\u062b\u0645','\u0643\u0644','\u0628\u064a\u0646','\u0647\u0648','\u0647\u064a','the','of','in','on','to','and','or','a','an','is','are','for','by','with']);
    const q = qTokens.filter(t => !stop.has(t));
    if (!q.length) return '';
    // find the window [i..j] of consecutive words matching the longest run of query tokens
    let best = null;
    for (let i = 0; i < words.length; i++) {
      let qi = 0, j = i;
      const matched = [];
      while (j < words.length && qi < q.length) {
        const w = words[j].norm;
        if (w === q[qi] || (q[qi].length >= 3 && (w.includes(q[qi]) || q[qi].includes(w)))) {
          matched.push(j); qi++; j++;
        } else if (stop.has(w)) {
          j++; // skip stopwords inside the phrase
        } else {
          break;
        }
      }
      if (matched.length) {
        const span = { from: matched[0], to: matched[matched.length - 1], hits: matched.length };
        if (!best || span.hits > best.hits) best = span;
      }
    }
    if (!best) return '';
    const a = Math.max(0, best.from - pad);
    const b = Math.min(words.length - 1, best.to + pad);
    const out = text.slice(words[a].start, words[b].end).replace(/\s+/g, ' ').trim();
    return (a > 0 ? '\u2026 ' : '') + out + (b < words.length - 1 ? ' \u2026' : '');
  },

  snippetFor(text, qTokens) {
    for (const q of qTokens) {
      const i = text.indexOf(q);
      if (i >= 0) {
        const start = Math.max(0, i - 60);
        const end = Math.min(text.length, i + q.length + 90);
        return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
      }
    }
    return '';
  },

  search(query, limit = 40) {
    const qTokens = this.tokenize(query);
    if (!qTokens.length) return [];
    const phrase = qTokens.join(' ');
    const strong = [], weak = [];
    for (const entry of this.index) {
      const r = this.searchScore(entry, qTokens, phrase);
      if (!r) continue;
      const excerpt = this.makeExcerpt(entry.raw, qTokens);
      const hit = { doc: entry.doc, kbName: entry.kbName, score: r.score / Math.sqrt(entry.tokens.length || 1), excerpt, snippet: excerpt || this.snippetFor(entry.text, qTokens) };
      (r.strong ? strong : weak).push(hit);
    }
    strong.sort((a, b) => b.score - a.score);
    weak.sort((a, b) => b.score - a.score);
    return (strong.length >= 5 ? strong : strong.concat(weak)).slice(0, limit);
  },

  searchSemantic(query, limit = 40) {
    const qTokens = this.tokenize(query);
    if (!qTokens.length) return [];
    const results = [];
    for (const entry of this.index) {
      const set = entry.tokenSet || new Set(entry.tokens);
      let hits = 0;
      for (const q of qTokens) {
        if (set.has(q)) { hits += 1; continue; }
        let best = 0;
        for (const t of set) {
          if (q.length >= 3 && t.includes(q)) best = Math.max(best, 0.6);
          else if (t.length >= 3 && q.includes(t)) best = Math.max(best, 0.4);
        }
        hits += best;
      }
      if (hits <= 0) continue;
      const phrase = qTokens.join(' ');
      const titleNorm = entry.titleNorm != null ? entry.titleNorm
        : this.tokenize((entry.doc.title && (entry.doc.title.ar || entry.doc.title.en)) || '').join(' ');
      let boost = this.titleHits(qTokens, entry.doc, entry) * 0.5;
      if (titleNorm.includes(phrase)) boost += 8;
      if (entry.text.includes(phrase)) boost += 3;
      const score = ((hits / qTokens.length) + boost) / Math.sqrt(entry.tokens.length || 1);
      results.push({ doc: entry.doc, kbName: entry.kbName, score: score * 10, snippet: this.snippetFor(entry.text, qTokens) });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  },

  get(id) { return this.byId.get(id); },

  catFor(doc) {
    const map = {
      law: 'legal', regulation: 'legal', decision: 'legal',
      circular: 'circulars', ruling: 'rulings', principle: 'rulings',
      agreement: 'agreements', note: 'notes'
    };
    return map[doc.type] || 'legal';
  },

  listByCat(cat, query) {
    const q = query && query.trim().length >= 2 ? query.trim().toLowerCase() : null;
    let items = this.index;
    if (cat && cat !== 'all') items = items.filter(e => this.catFor(e.doc) === cat);
    if (q) {
      const qTokens = this.tokenize(q);
      items = items.filter(e => {
        const m = this.matchScore(qTokens, e.tokens);
        return m.ok;
      });
    }
    return items.map(e => e.doc);
  },

  relationsOf(docId) {
    const doc = this.get(docId);
    if (!doc) return { outgoing: [], incoming: [] };
    const outgoing = (doc.relations || []).map(r => ({
      ...r, targetDoc: this.get(r.target), direction: 'out'
    }));
    const incoming = [];
    for (const entry of this.index) {
      (entry.doc.relations || []).forEach(r => {
        if (r.target === docId) incoming.push({ ...r, sourceDoc: entry.doc, direction: 'in' });
      });
    }
    return { outgoing, incoming };
  }
};
