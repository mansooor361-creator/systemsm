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
        /* v1.6.34: normalize every document to the canonical legal format */
        if (doc && doc.body && typeof DocFormat !== 'undefined') {
          const nb = DocFormat.normalize(doc.body);
          if (nb !== doc.body) doc.body = nb;
        }
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
          normText: this.normChars(text),
          tokens,
          tokenSet: new Set(tokens),
          tokenFreq: freq,
          titleNorm: this.tokenize((doc.title && (doc.title.ar || doc.title.en)) || '').join(' '),
          titleTokens: this.tokenize((doc.title && (doc.title.ar || doc.title.en)) || ''),
          headTokens: this.tokenize(String(text).split(/\r?\n/).filter(l => /^#{1,6}\s/.test(l)).join('\n')),
          articles: (doc.articles || []).map(a => {
            const at = `${a.num || ''} ${(a.title && (a.title.ar || a.title.en)) || ''} ${a.text || ''}`;
            const atokens = this.tokenize(at);
            const afreq = new Map();
            for (const t of atokens) afreq.set(t, (afreq.get(t) || 0) + 1);
            return { num: a.num, tokens: atokens, tokenSet: new Set(atokens), tokenFreq: afreq };
          })
        });
      });
    });
    /* corpus statistics for BM25-style IDF ranking */
    this.N = this.index.length;
    this.avgLen = this.index.reduce((s2, e) => s2 + e.tokens.length, 0) / (this.N || 1);
    const df = new Map();
    this.index.forEach(e => { e.tokenSet.forEach(t => df.set(t, (df.get(t) || 0) + 1)); });
    this.df = df;
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

  /* v1.6.24: full Arabic normalization — diacritics, tatweel, alef/hamza
     forms, final yaa/alef maqsura, taa marbuta, waw/yaa hamza forms. */
  normChars(s) {
    return String(s).toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0624/g, '\u0648')
      .replace(/\u0626/g, '\u064A')
      .replace(/\u0629/g, '\u0647');
  },

  tokenize(text) {
    if (!this.STOP) {
      this.STOP = new Set(['في','من','على','عن','إلى','الى','التي','الذي','هذا','هذه','ما','مع','أو','او','ثم','كل','بين','هو','هي','the','of','in','on','to','and','or','a','an','is','are','for','by','with'].map(w => this.normChars(w)));
    }
    return this.normChars(text)
      .replace(/[^\u0600-\u06FF\u0041-\u007A\u0030-\u0039\u0660-\u0669]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.STOP.has(w))
      .map(w => this.stripPrefix(w))
      .filter(w => w.length > 1);
  },

  /* light Arabic prefix stemmer: definite article + attached
     prepositions, then the conjunction waw (only when long enough) */
  stripPrefix(w) {
    w = w.replace(/^(\u0627\u0644|\u0648\u0627\u0644|\u0628\u0627\u0644|\u0641\u0627\u0644|\u0644\u0644)/, '');
    if (w.length >= 4 && w.charAt(0) === '\u0648') w = w.slice(1);
    return w;
  },

  /* exact=1, prefix=0.6 (replaces noisy bidirectional substring matching) */
  tokMatch(q, t) {
    if (q === t) return 1;
    if (q.length >= 3 && t.length >= 3 && (t.startsWith(q) || q.startsWith(t))) return 0.6;
    return 0;
  },

  matchScore(queryTokens, docTokens, pre) {
    const freq = pre && pre.tokenFreq && typeof pre.tokenFreq.get === 'function' ? pre.tokenFreq : null;
    const set = pre && pre.tokenSet && typeof pre.tokenSet.has === 'function' ? pre.tokenSet : null;
    let exact = 0, partial = 0;
    for (const q of queryTokens) {
      let hit = 0;
      if (freq && set) {
        if (freq.get(q)) hit = 1;
        else if (q.length >= 3) {
          for (const t of set) {
            const h = this.tokMatch(q, t);
            if (h) { hit = h; break; }
          }
        }
      } else {
        for (const t of docTokens) {
          const h = this.tokMatch(q, t);
          if (h === 1) { hit = 1; break; }
          if (h) hit = Math.max(hit, h);
        }
      }
      if (hit === 1) exact++;
      else if (hit) partial++;
    }
    const ok = exact > 0 || partial >= 2 || (queryTokens.length === 1 && partial > 0);
    return { exact, partial, ok, total: exact + partial };
  },

  /* v1.6.24: BM25-style ranking with IDF so rare legal terms outweigh
     common words; field boosts for title and markdown headings. */
  idf(t) {
    const df = (this.df && this.df.get(t)) || 0;
    return Math.log(1 + (((this.N || 1) - df + 0.5) / (df + 0.5)));
  },

  bm25(qTokens, entry) {
    const k1 = 1.2, b = 0.75;
    const len = entry.tokens.length || 1;
    const freq = entry.tokenFreq || null;
    let s = 0, matched = 0;
    if (freq && typeof freq.get === 'function') {
      for (const q of qTokens) {
        let tf = freq.get(q) || 0;
        if (!tf && q.length >= 3) {
          for (const t of freq.keys()) {
            if (t.length >= 3 && (t.startsWith(q) || q.startsWith(t))) { tf = freq.get(t); break; }
          }
        }
        if (!tf) continue;
        matched++;
        s += this.idf(q) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len / (this.avgLen || 1)));
      }
    }
    return { score: s, matched };
  },

  headHits(qTokens, entry) {
    const ht = entry.headTokens || [];
    return qTokens.filter(q => ht.some(t => this.tokMatch(q, t) > 0)).length;
  },

  /* which article of the doc contains the match (for the result chip + jump) */
  findArticle(entry, qTokens) {
    if (!entry.articles || !entry.articles.length) return null;
    let best = null;
    for (const a of entry.articles) {
      const m = this.matchScore(qTokens, a.tokens, a);
      if (m.exact > 0) {
        const sc = m.exact + m.partial * 0.3;
        if (!best || sc > best.sc) best = { num: a.num, sc };
      }
    }
    return best ? best.num : null;
  },

  searchScore(entry, qTokens, phrase) {
    const titleNorm = entry.titleNorm != null ? entry.titleNorm
      : this.tokenize((entry.doc.title && (entry.doc.title.ar || entry.doc.title.en)) || '').join(' ');
    const titlePhrase = titleNorm.includes(phrase);
    const bodyPhrase = entry.text.includes(phrase);
    const bm = this.bm25(qTokens, entry);
    const th = this.titleHits(qTokens, entry.doc, entry);
    const hh = this.headHits(qTokens, entry);
    if (!bm.matched && !titlePhrase && !bodyPhrase) return null;
    const base = bm.score + th * 2 + hh * 1.2;
    let score = base;
    if (titlePhrase) score += 100;
    if (bodyPhrase) score += 40;
    return { m: { exact: bm.matched, partial: 0, ok: bm.matched > 0, total: bm.matched }, score, base, strong: bm.matched > 0 || titlePhrase || bodyPhrase };
  },

  titleHits(qTokens, doc, entry) {
    const titleTokens = (entry && entry.titleTokens) || this.tokenize((doc.title && (doc.title.ar || doc.title.en)) || '');
    return qTokens.filter(q => titleTokens.some(t => t === q || (q.length >= 3 && (t.includes(q) || q.includes(t))))).length;
  },

  normalizeWord(w) {
    return this.stripPrefix(this.normChars(w));
  },

  escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /* v1.6.24: monochrome highlight of the matched words inside the excerpt */
  highlightExcerpt(text, qTokens) {
    const t = String(text || '');
    if (!t || !qTokens || !qTokens.length) return this.escHtml(t);
    const re = /[\u0600-\u06FF\u0041-\u007A\u0030-\u0039\u0660-\u0669]+/g;
    let out = '', last = 0, m;
    while ((m = re.exec(t)) !== null) {
      out += this.escHtml(t.slice(last, m.index));
      const w = this.normalizeWord(m[0]);
      const hit = qTokens.some(q => this.tokMatch(q, w) > 0);
      out += hit ? '<mark class="hl">' + this.escHtml(m[0]) + '</mark>' : this.escHtml(m[0]);
      last = m.index + m[0].length;
    }
    out += this.escHtml(t.slice(last));
    return out;
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
        if (this.tokMatch(q[qi], w) > 0) {
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

  /* v1.6.43: precise literal matching — every wording variant normalized (أ/ا, ة/ه …),
     then a deterministic ranking like desktop apps (Obsidian-style):
     tier 1 = full searched phrase in the TITLE
     tier 2 = every search word in the title
     tier 3 = full searched phrase in the CONTENT
     tier 4 = every search word in the content
     tier 5 = some words present
     tier 6 = weak (prefix) matches only */
  searchTier(entry, qTokens, phrase) {
    const titleNorm = entry.titleNorm != null ? entry.titleNorm
      : this.tokenize((entry.doc.title && (entry.doc.title.ar || entry.doc.title.en)) || '').join(' ');
    const titlePhrase = titleNorm.includes(phrase);
    let titleWords = 0;
    for (const q of qTokens) if (entry.titleTokens && entry.titleTokens.includes(q)) titleWords++;
    const ntext = entry.normText || entry.text || '';
    const bodyPhrase = ntext.includes(phrase);
    const occ = bodyPhrase ? ntext.split(phrase).length - 1 : 0;
    let words = 0;
    for (const q of qTokens) if (entry.tokenSet && entry.tokenSet.has(q)) words++;
    if (titlePhrase) return { tier: 1, words, occ };
    if (titleWords === qTokens.length) return { tier: 2, words, occ };
    if (bodyPhrase) return { tier: 3, words, occ };
    if (words === qTokens.length) return { tier: 4, words, occ };
    if (titleWords > 0 || words > 0) return { tier: 5, words, occ };
    /* v1.6.44: the weak lenient (prefix-only) rank is REMOVED — documents that
       never contain the searched words (not even as a word start) no longer
       appear; only real matches are displayed. */
    return null;
  },

  search(query, limit = 2000) {
    const qTokens = this.tokenize(query);
    if (!qTokens.length) return [];
    const phrase = qTokens.join(' ');
    const scored = [];
    for (const entry of this.index) {
      const st = this.searchTier(entry, qTokens, phrase);
      if (!st) continue;
      const bm = this.bm25(qTokens, entry);
      scored.push({ entry, st, bm });
    }
    const n = qTokens.length || 1;
    scored.sort((a, b) => {
      if (a.st.tier !== b.st.tier) return a.st.tier - b.st.tier;
      const ra = a.st.words / n, rb = b.st.words / n;
      if (rb !== ra) return rb - ra;
      if (b.bm.score !== a.bm.score) return b.bm.score - a.bm.score;
      return (b.st.occ || 0) - (a.st.occ || 0);
    });
    const hits = scored.slice(0, limit).map(({ entry, st, bm }) => {
      const excerpt = this.makeExcerpt(entry.raw, qTokens);
      const lang = (typeof I18n !== 'undefined' && I18n.lang) || 'ar';
      const title = entry.doc.title[lang] || entry.doc.title.ar || entry.doc.title.en || '';
      return {
        doc: entry.doc, kbName: entry.kbName, score: bm.score, base: st.tier, tier: st.tier,
        titleHtml: this.highlightExcerpt(title, qTokens),
        excerpt, snippet: excerpt || this.snippetFor(entry.text, qTokens),
        excerptHtml: this.highlightExcerpt(excerpt, qTokens),
        articleNum: this.findArticle(entry, qTokens)
      };
    });
    /* v1.6.43: the REAL total of matches — the result count is no longer a fixed number */
    hits.total = scored.length;
    return hits;
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
      const excerpt = this.makeExcerpt(entry.raw, qTokens);
      const lang = (typeof I18n !== 'undefined' && I18n.lang) || 'ar';
      const title = entry.doc.title[lang] || entry.doc.title.ar || entry.doc.title.en || '';
      results.push({ doc: entry.doc, kbName: entry.kbName, score: score * 10, titleHtml: this.highlightExcerpt(title, qTokens), excerpt, snippet: excerpt || this.snippetFor(entry.text, qTokens), excerptHtml: this.highlightExcerpt(excerpt, qTokens), articleNum: this.findArticle(entry, qTokens) });
    }
    results.sort((a, b) => b.score - a.score);
    results.total = results.length;
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
