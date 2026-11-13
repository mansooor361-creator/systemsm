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
      (kb.documents || []).forEach(doc => {
        doc.kbId = kb.id;
        this.byId.set(doc.id, doc);
        this.index.push({
          doc,
          kbId: kb.id,
          kbName: kb.name,
          text: this.docText(doc).toLowerCase(),
          tokens: this.tokenize(this.docText(doc))
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

  matchScore(queryTokens, docTokens) {
    let exact = 0, partial = 0;
    for (const q of queryTokens) {
      let hit = 0;
      for (const t of docTokens) {
        if (t === q) { hit = 1; break; }
        if (q.length >= 3 && (t.includes(q) || q.includes(t))) hit = Math.max(hit, 0.6);
      }
      if (hit === 1) exact++;
      else if (hit) partial++;
    }
    return { exact, partial, ok: exact > 0 || partial >= 2, total: exact + partial };
  },

  search(query, limit = 40) {
    const qTokens = this.tokenize(query);
    if (!qTokens.length) return [];
    const results = [];
    for (const entry of this.index) {
      const m = this.matchScore(qTokens, entry.tokens);
      if (!m.ok) continue;
      const score = m.total / Math.sqrt(entry.tokens.length || 1);
      results.push({ doc: entry.doc, kbName: entry.kbName, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  },

  searchSemantic(query, limit = 40) {
    const qTokens = this.tokenize(query);
    if (!qTokens.length) return [];
    const results = [];
    for (const entry of this.index) {
      const set = new Set(entry.tokens);
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
      const score = (hits / qTokens.length) / Math.sqrt(entry.tokens.length || 1);
      results.push({ doc: entry.doc, kbName: entry.kbName, score: score * 10 });
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
  },

  graphData(centerId) {
    const nodes = new Map();
    const edges = [];
    const addNode = (id) => {
      if (!id || nodes.has(id)) return;
      const d = this.get(id);
      if (!d) return;
      nodes.set(id, { id, label: d.title.ar || d.title.en || id, type: d.type });
    };
    if (centerId) {
      addNode(centerId);
      const { outgoing, incoming } = this.relationsOf(centerId);
      outgoing.forEach(r => { addNode(r.target); edges.push({ a: centerId, b: r.target, type: r.type }); });
      incoming.forEach(r => { addNode(r.sourceDoc.id); edges.push({ a: r.sourceDoc.id, b: centerId, type: r.type }); });
    } else {
      this.index.forEach(e => addNode(e.doc.id));
      this.index.forEach(e => (e.doc.relations || []).forEach(r => {
        if (this.byId.has(r.target)) edges.push({ a: e.doc.id, b: r.target, type: r.type });
      }));
    }
    return { nodes: [...nodes.values()], edges };
  }
};
