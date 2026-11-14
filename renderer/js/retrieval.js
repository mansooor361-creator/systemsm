'use strict';

/*
 * Grounded retrieval engine.
 * Answers are built ONLY from knowledge-base passages.
 * - Extractive mode (default, no API key): returns verbatim KB passages.
 * - LLM mode (optional key): the model receives ONLY retrieved passages and a
 *   strict instruction to refuse anything not in them.
 */

const Retrieval = {
  passages: [],

  build() {
    this.passages = [];
    KB.index.forEach(entry => {
      const doc = entry.doc;
      const title = doc.title.ar || doc.title.en || doc.id;

      this.passages.push({
        docId: doc.id, docTitle: title, type: doc.type, kbId: entry.kbId,
        articleNum: null,
        kind: 'meta',
        text: `${title} — ${I18n.docTypeName(doc.type)} — ${I18n.t('issuer')}: ${doc.issuer ? (doc.issuer.ar || doc.issuer.en || '') : '—'} — ${I18n.t('number')}: ${doc.number || '—'} — ${I18n.t('date')}: ${doc.date || '—'} — ${I18n.t('status')}: ${I18n.t('status_' + (doc.status || 'in_force'))} — ${I18n.t('version')}: ${doc.version}`
      });

      if (doc.summary) {
        this.passages.push({
          docId: doc.id, docTitle: title, type: doc.type, kbId: entry.kbId,
          articleNum: null, kind: 'summary',
          text: doc.summary.ar || doc.summary.en || ''
        });
      }

      (doc.articles || []).forEach(a => {
        const aTitle = a.title ? (a.title.ar || a.title.en || '') : '';
        this.passages.push({
          docId: doc.id, docTitle: title, type: doc.type, kbId: entry.kbId,
          articleNum: a.num, kind: 'article',
          text: (a.num ? `${a.num}${aTitle ? ' — ' + aTitle : ''}: ` : '') + (a.text || '')
        });
      });

      (doc.versionHistory || []).forEach(v => {
        this.passages.push({
          docId: doc.id, docTitle: title, type: doc.type, kbId: entry.kbId,
          articleNum: null, kind: 'version',
          text: `${I18n.t('versionHistory')} — ${I18n.t('version')} ${v.version} (${v.date}): ${v.change ? (v.change.ar || v.change.en || '') : ''} ${v.by || ''}`
        });
      });

      (doc.relations || []).forEach(r => {
        const target = KB.get(r.target);
        this.passages.push({
          docId: doc.id, docTitle: title, type: doc.type, kbId: entry.kbId,
          articleNum: null, kind: 'relation',
          text: `${I18n.t('rel_' + r.type)}: ${target ? (target.title.ar || target.title.en || r.target) : r.target} — ${r.note ? (r.note.ar || r.note.en || '') : ''}`
        });
      });
    });
    this.passages.forEach(p => {
      p.tokens = KB.tokenize(p.text);
      p.tokenSet = new Set(p.tokens);
      p.tokenFreq = new Map();
      for (const t of p.tokens) p.tokenFreq.set(t, (p.tokenFreq.get(t) || 0) + 1);
    });
  },

  retrieve(query, opts = {}) {
    const qTokens = KB.tokenize(query);
    if (!qTokens.length) return [];
    const scopeIds = opts.scopeDocIds || null;
    const scored = [];

    for (const p of this.passages) {
      if (scopeIds && !scopeIds.has(p.docId)) continue;
      const m = KB.matchScore(qTokens, p.tokens, p);
      if (!m.ok) continue;
      let score = m.total;
      if (p.kind === 'article') score *= 1.25;
      if (p.kind === 'relation' || p.kind === 'version') score *= 0.9;
      if (m.exact + m.partial >= 3) score *= 1.3;
      scored.push({ ...p, score, matched: qTokens.slice(0, m.exact + m.partial) });
    }

    scored.sort((a, b) => b.score - a.score);

    const picked = [];
    const seen = new Set();
    for (const p of scored) {
      const key = p.docId + '|' + (p.articleNum || '') + '|' + p.kind;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(p);
      if (picked.length >= (opts.topK || 8)) break;
    }
    return picked;
  },

  scopeDocIds(docId, depth = 1) {
    if (!docId) return null;
    const ids = new Set([docId]);
    let frontier = [docId];
    for (let d = 0; d < depth; d++) {
      const next = [];
      frontier.forEach(id => {
        const { outgoing, incoming } = KB.relationsOf(id);
        outgoing.forEach(r => { if (r.targetDoc && !ids.has(r.target)) { ids.add(r.target); next.push(r.target); } });
        incoming.forEach(r => { if (!ids.has(r.sourceDoc.id)) { ids.add(r.sourceDoc.id); next.push(r.sourceDoc.id); } });
      });
      frontier = next;
    }
    return ids;
  },

  extractiveAnswer(query, opts = {}) {
    const passages = this.retrieve(query, opts);
    if (!passages.length) {
      return { mode: 'extractive', answer: I18n.t('chatNoAnswer'), citations: [], passages: [] };
    }
    const lines = passages.map((p, i) => {
      const art = p.articleNum ? ` (${p.articleNum})` : '';
      return `**[${i + 1}] ${p.docTitle}${art}**\n> ${p.text}`;
    });
    return {
      mode: 'extractive',
      answer: lines.join('\n\n'),
      citations: passages.map(p => ({ docId: p.docId, docTitle: p.docTitle, articleNum: p.articleNum })),
      passages
    };
  },

  async llmAnswer(query, opts = {}) {
    const settings = window.daaixSettings || {};
    const llm = settings.llm || {};
    if (!llm.apiKey || !llm.baseUrl) return null;

    const passages = this.retrieve(query, { ...opts, topK: 10 });
    if (!passages.length) {
      return { mode: 'llm', answer: I18n.t('chatNoAnswer'), citations: [], passages: [] };
    }

    const context = passages.map((p, i) =>
      `[${i + 1}] (${p.docId}${p.articleNum ? ' — ' + p.articleNum : ''}) ${p.docTitle}\n${p.text}`
    ).join('\n\n');

    const langRule = I18n.lang === 'ar'
      ? 'أجب بالعربية الفصحى.'
      : 'Answer in English.';

    const system = [
      'You are DaAIx, a legal assistant grounded in a verified legal knowledge base.',
      'STRICT RULES: Use ONLY the passages provided in the context. Never add outside knowledge, never infer, never guess.',
      'Cite passages inline using their [n] numbers. If the context does not contain the answer, reply exactly with the refusal sentence you are given below.',
      langRule,
      `REFUSAL SENTENCE: ${I18n.t('chatNoAnswer')}`
    ].join('\n');

    try {
      const res = await fetch(llm.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llm.apiKey },
        body: JSON.stringify({
          model: llm.model || 'gpt-4o-mini',
          temperature: 0,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `CONTEXT:\n${context}\n\nQUESTION: ${query}` }
          ]
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!answer) throw new Error('empty response');
      return { mode: 'llm', answer, citations: passages.map(p => ({ docId: p.docId, docTitle: p.docTitle, articleNum: p.articleNum })), passages };
    } catch (e) {
      const fallback = this.extractiveAnswer(query, opts);
      fallback.mode = 'extractive-fallback';
      return fallback;
    }
  }
};
