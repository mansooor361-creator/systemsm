'use strict';

/*
 * DaAIx Agents — نظام الوكلاء القانونيين
 * Inspired by Obsidian Copilot's agent model (sessions, commands, BYOK,
 * connectors) rebuilt for legal work and grounded 100% in the knowledge base.
 */

const AGENTS = [
  {
    id: 'consultant',
    icon: '⚖️',
    label: { ar: 'المستشار القانوني العام', en: 'General Legal Advisor' },
    desc: {
      ar: 'استشارات قانونية مُسنَدة إلى قواعد المعرفة للأفراد والشركات والجهات الحكومية.',
      en: 'KB-grounded legal consultations for individuals, companies and government.'
    },
    fields: [
      { key: 'question', type: 'textarea', label: { ar: 'سؤالك أو موضوع الاستشارة', en: 'Your question' } },
      { key: 'sector', type: 'select', label: { ar: 'القطاع', en: 'Sector' }, options: { ar: ['أفراد', 'شركات', 'جهة حكومية', 'مستثمر'], en: ['Individual', 'Company', 'Government', 'Investor'] } }
    ],
    scope: null,
    sections: [
      { key: 'summary', title: { ar: 'الخلاصة القانونية', en: 'Legal Summary' } },
      { key: 'basis', title: { ar: 'الأساس النظامي', en: 'Legal Basis' } },
      { key: 'risks', title: { ar: 'المخاطر والتنبيهات', en: 'Risks & Caveats' } },
      { key: 'actions', title: { ar: 'الخطوات المقترحة', en: 'Recommended Actions' } }
    ]
  },
  {
    id: 'memo',
    icon: '📜',
    label: { ar: 'صياغة المذكرات القانونية', en: 'Legal Memo Drafting' },
    desc: {
      ar: 'صياغة مذكرات دعوى أو رد أو دفوع وفق النماذج القضائية والأنظمة المرتبطة.',
      en: 'Draft claims, replies and defenses per judicial templates and related laws.'
    },
    fields: [
      { key: 'caseType', type: 'select', label: { ar: 'نوع المذكرة', en: 'Memo Type' }, options: { ar: ['مذكرة دعوى', 'مذكرة رد', 'مذكرة دفوع', 'مذكرة استئناف'], en: ['Claim memo', 'Reply memo', 'Defense memo', 'Appeal memo'] } },
      { key: 'facts', type: 'textarea', label: { ar: 'الوقائع', en: 'Facts' } },
      { key: 'claims', type: 'textarea', label: { ar: 'الطلبات', en: 'Requests' } }
    ],
    scope: null,
    sections: [
      { key: 'header', title: { ar: 'الديباجة', en: 'Preamble' } },
      { key: 'facts', title: { ar: 'الوقائع', en: 'Facts' } },
      { key: 'grounds', title: { ar: 'الأسانيد النظامية', en: 'Legal Grounds' } },
      { key: 'requests', title: { ar: 'الطلبات', en: 'Requests' } }
    ]
  },
  {
    id: 'strategy',
    icon: '🗺️',
    label: { ar: 'استراتيجية الدعوى وخريطة التقاضي', en: 'Litigation Strategy & Roadmap' },
    desc: {
      ar: 'بناء خريطة طريق التقاضي: المسار القضائي، المدد، التكاليف، والدفوع المتوقعة.',
      en: 'Litigation roadmap: track, durations, costs and expected defenses.'
    },
    fields: [
      { key: 'dispute', type: 'textarea', label: { ar: 'وصف النزاع', en: 'Dispute description' } },
      { key: 'position', type: 'select', label: { ar: 'موقفك', en: 'Your position' }, options: { ar: ['مدعي', 'مدعى عليه'], en: ['Claimant', 'Defendant'] } }
    ],
    scope: null,
    sections: [
      { key: 'classification', title: { ar: 'تكييف النزاع والمسار القضائي', en: 'Classification & Court Track' } },
      { key: 'roadmap', title: { ar: 'خريطة الطريق والمراحل', en: 'Roadmap & Stages' } },
      { key: 'evidence', title: { ar: 'الأدلة المطلوبة', en: 'Required Evidence' } },
      { key: 'defenses', title: { ar: 'الدفوع المتوقعة من الخصم', en: 'Expected Counter-Defenses' } },
      { key: 'costs', title: { ar: 'التكاليف والمدد التقديرية', en: 'Costs & Durations' } }
    ]
  },
  {
    id: 'contracts',
    icon: '🤝',
    label: { ar: 'العقود الدولية والإقليمية', en: 'International & Regional Contracts' },
    desc: {
      ar: 'صياغة هياكل العقود التجارية الدولية والإقليمية وبنودها الحرجة.',
      en: 'Draft international/regional commercial contract structures and critical clauses.'
    },
    fields: [
      { key: 'contractType', type: 'select', label: { ar: 'نوع العقد', en: 'Contract Type' }, options: { ar: ['توريد دولي', 'وكالة وتوزيع', 'مشروع مشترك', 'ترخيص تقنية', 'خدمات استشارية'], en: ['International supply', 'Agency & distribution', 'Joint venture', 'Technology license', 'Consulting services'] } },
      { key: 'parties', type: 'textarea', label: { ar: 'الأطراف والاختصاص القضائي', en: 'Parties & jurisdiction' } },
      { key: 'requirements', type: 'textarea', label: { ar: 'متطلبات خاصة', en: 'Special requirements' } }
    ],
    scope: null,
    sections: [
      { key: 'structure', title: { ar: 'هيكل العقد المقترح', en: 'Proposed Structure' } },
      { key: 'clauses', title: { ar: 'البنود الحرجة', en: 'Critical Clauses' } },
      { key: 'governing', title: { ar: 'القانون الواجب والتحكيم', en: 'Governing Law & Arbitration' } },
      { key: 'risks', title: { ar: 'مخاطر التعاقد عبر الحدود', en: 'Cross-Border Risks' } }
    ]
  },
  {
    id: 'research',
    icon: '📚',
    label: { ar: 'البحوث والدراسات القانونية', en: 'Legal Research & Studies' },
    desc: {
      ar: 'إعداد بحوث ودراسات للأكاديميين والباحثين مع الإحالة إلى مصادر قاعدة المعرفة.',
      en: 'Research papers and studies for academics, cited from the knowledge base.'
    },
    fields: [
      { key: 'topic', type: 'textarea', label: { ar: 'موضوع البحث', en: 'Research topic' } },
      { key: 'depth', type: 'select', label: { ar: 'عمق المعالجة', en: 'Depth' }, options: { ar: ['موجز تنفيذي', 'ورقة بحثية', 'دراسة معمقة'], en: ['Executive brief', 'Research paper', 'In-depth study'] } }
    ],
    scope: null,
    sections: [
      { key: 'intro', title: { ar: 'المقدمة وأهمية الموضوع', en: 'Introduction & Significance' } },
      { key: 'framework', title: { ar: 'الإطار النظامي', en: 'Regulatory Framework' } },
      { key: 'analysis', title: { ar: 'التحليل والتطبيقات', en: 'Analysis & Applications' } },
      { key: 'findings', title: { ar: 'النتائج والتوصيات', en: 'Findings & Recommendations' } },
      { key: 'refs', title: { ar: 'المصادر والمراجع', en: 'References' } }
    ]
  },
  {
    id: 'governance',
    icon: '🏛️',
    label: { ar: 'الحوكمة وإدارة المخاطر', en: 'Governance & Risk Management' },
    desc: {
      ar: 'برامج الالتزام، سجلات المخاطر، والسياسات الداخلية للجهات الحكومية والشركات.',
      en: 'Compliance programs, risk registers and internal policies.'
    },
    fields: [
      { key: 'entity', type: 'textarea', label: { ar: 'وصف الجهة ونشاطها', en: 'Entity & activity' } },
      { key: 'focus', type: 'select', label: { ar: 'محور العمل', en: 'Focus' }, options: { ar: ['برنامج التزام', 'سجل مخاطر', 'سياسة داخلية', 'لجنة ومجلس'], en: ['Compliance program', 'Risk register', 'Internal policy', 'Board & committees'] } }
    ],
    scope: null,
    sections: [
      { key: 'scope', title: { ar: 'نطاق العمل والمتطلبات النظامية', en: 'Scope & Regulatory Requirements' } },
      { key: 'framework', title: { ar: 'الإطار المقترح', en: 'Proposed Framework' } },
      { key: 'controls', title: { ar: 'الضوابط والإجراءات', en: 'Controls & Procedures' } },
      { key: 'register', title: { ar: 'سجل المخاطر الأولي', en: 'Initial Risk Register' } }
    ]
  }
];

const Agents = {
  current: null,
  sessions: {},
  outputs: {},

  list() { return AGENTS; },

  get(id) { return AGENTS.find(a => a.id === id); },

  open(id) {
    this.current = id || AGENTS[0].id;
    App.showView('agents');
    this.renderMenu();
    this.render();
  },

  renderMenu() {
    const menu = document.getElementById('agentsMenu');
    menu.innerHTML = '';
    AGENTS.forEach(a => {
      const chip = document.createElement('div');
      chip.className = 'tool-chip' + (this.current === a.id ? ' active' : '');
      chip.textContent = `${a.icon} ${a.label[I18n.lang] || a.label.ar}`;
      chip.onclick = () => { this.current = a.id; this.renderMenu(); this.render(); };
      menu.appendChild(chip);
    });
  },

  render() {
    const agent = this.get(this.current);
    const ws = document.getElementById('agentWorkspace');
    ws.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'agent-desc';
    head.textContent = agent.desc[I18n.lang] || agent.desc.ar;
    ws.appendChild(head);

    const form = document.createElement('div');
    form.className = 'form-grid';
    agent.fields.forEach(f => {
      const label = document.createElement('label');
      const span = document.createElement('span');
      span.textContent = f.label[I18n.lang] || f.label.ar;
      label.appendChild(span);
      let input;
      if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 3;
      } else if (f.type === 'select') {
        input = document.createElement('select');
        (f.options[I18n.lang] || f.options.ar).forEach(o => {
          const opt = document.createElement('option');
          opt.textContent = o;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = 'text';
      }
      input.dataset.field = f.key;
      label.appendChild(input);
      form.appendChild(label);
    });
    ws.appendChild(form);

    const cmds = document.createElement('div');
    cmds.className = 'agent-commands';
    const cmdLabel = document.createElement('span');
    cmdLabel.className = 'hint';
    cmdLabel.textContent = I18n.t('agentCommands') + ': ';
    cmds.appendChild(cmdLabel);
    [
      { ar: 'لخّص الأساس النظامي', en: 'Summarize legal basis' },
      { ar: 'اذكر المخاطر الرئيسية', en: 'List key risks' },
      { ar: 'اقترح خطوات تنفيذية', en: 'Suggest action steps' }
    ].forEach(c => {
      const b = document.createElement('button');
      b.className = 'cmd-chip';
      b.textContent = c[I18n.lang] || c.ar;
      b.onclick = () => {
        const q = ws.querySelector('[data-field="question"], [data-field="dispute"], [data-field="topic"], [data-field="requirements"], [data-field="facts"], [data-field="entity"]');
        if (q && !q.value) q.value = c[I18n.lang] || c.ar;
        this.run();
      };
      cmds.appendChild(b);
    });
    ws.appendChild(cmds);

    const runBtn = document.createElement('button');
    runBtn.className = 'primary';
    runBtn.id = 'agentRun';
    runBtn.textContent = '▶ ' + I18n.t('agentRun');
    runBtn.onclick = () => this.run();
    ws.appendChild(runBtn);

    const out = document.createElement('div');
    out.id = 'agentOutput';
    ws.appendChild(out);

    if (this.outputs[this.current]) {
      this.renderOutput(this.outputs[this.current]);
    }
  },

  collectInputs() {
    const agent = this.get(this.current);
    const inputs = {};
    document.querySelectorAll('#agentWorkspace [data-field]').forEach(el => {
      inputs[el.dataset.field] = el.value.trim();
    });
    return { agent, inputs };
  },

  buildBrief(agent, inputs) {
    const lang = I18n.lang;
    const parts = [agent.label[lang] || agent.label.ar];
    agent.fields.forEach(f => {
      const v = inputs[f.key];
      if (v) parts.push(`${f.label[lang] || f.label.ar}: ${v}`);
    });
    return parts.join('\n');
  },

  async run() {
    const { agent, inputs } = this.collectInputs();
    const brief = this.buildBrief(agent, inputs);
    const out = document.getElementById('agentOutput');
    out.innerHTML = `<div class="result-card">${I18n.t('loading')}</div>`;

    const scopeIds = agent.scope ? new Set(agent.scope) : null;
    const kbRes = Retrieval.extractiveAnswer(brief, { scopeDocIds: scopeIds, topK: 10 });

    let external = [];
    const connectors = ((window.daaixSettings || {}).connectors || []).filter(c => c.enabled !== false && c.url);
    for (const c of connectors) {
      try {
        const res = await window.daaix.netPost(c.url, c.apiKey || '', { query: brief });
        if (res && res.answer) {
          external.push({ name: c.name || c.url, answer: String(res.answer) });
        }
      } catch (e) { /* connector offline: skip */ }
    }

    const llm = (window.daaixSettings || {}).llm || {};
    let result;
    if (llm.apiKey && llm.baseUrl) {
      result = await this.llmRun(agent, inputs, brief, kbRes, external);
    } else {
      result = this.extractiveRun(agent, inputs, kbRes, external);
    }

    this.outputs[this.current] = result;
    this.sessions[this.current] = this.sessions[this.current] || [];
    this.sessions[this.current].push({ role: 'user', content: brief });
    this.sessions[this.current].push({ role: 'agent', content: result.markdown });

    this.renderOutput(result);
  },

  extractiveRun(agent, inputs, kbRes, external) {
    const lang = I18n.lang;
    const lines = [];
    lines.push(`# ${agent.label[lang] || agent.label.ar}`);
    lines.push('');
    lines.push(`> ${I18n.t('chatGrounded')} — ${new Date().toLocaleDateString()}`);
    lines.push('');

    agent.sections.forEach(sec => {
      lines.push(`## ${sec.title[lang] || sec.title.ar}`);
      lines.push('');
      const relevant = this.passagesForSection(sec.key, kbRes.passages);
      if (relevant.length) {
        relevant.forEach((p, i) => {
          const art = p.articleNum ? ` (${p.articleNum})` : '';
          lines.push(`**${p.docTitle}${art}**`);
          lines.push(`> ${p.text}`);
          lines.push('');
        });
      } else {
        lines.push(lang === 'ar'
          ? '— لا توجد نصوص موثقة في قاعدة المعرفة لهذا القسم بعد؛ أكمل الحقول أو أضف مصادر عبر الموصلات.'
          : '— No documented KB passages for this section yet; complete the fields or add sources via connectors.');
        lines.push('');
      }
    });

    if (external.length) {
      lines.push(`## ${I18n.t('externalSources')}`);
      lines.push('');
      external.forEach(e => {
        lines.push(`**${e.name}**`);
        lines.push(`> ${e.answer}`);
        lines.push('');
      });
    }

    lines.push(`---`);
    lines.push(`*${I18n.t('agentDisclaimer')}*`);
    lines.push('');
    lines.push(`${I18n.t('chatCitations')}: ${kbRes.citations.map((c, i) => `[${i + 1}] ${c.docTitle}${c.articleNum ? ' (' + c.articleNum + ')' : ''}`).join(' · ') || '—'}`);

    return { markdown: lines.join('\n'), citations: kbRes.citations, mode: 'extractive' };
  },

  passagesForSection(key, passages) {
    const hints = {
      summary: null, basis: ['مادة', 'نظام', 'لائحة', 'article'], risks: ['مخاطر', 'غير مشروع', 'جزاء', 'risk'],
      actions: ['يجب', 'على', 'طلب', 'steps'], header: [], facts: ['وقائع', 'facts'],
      grounds: ['مادة', 'استناد', 'مبدأ', 'cites'], requests: ['طلب', 'طلبية', 'request'],
      classification: null, roadmap: ['مرحلة', 'مدة', 'stage'], evidence: ['إثبات', 'دليل', 'evidence'],
      defenses: ['دفوع', 'دفاع', 'defense'], costs: ['رسوم', 'مكافأة', 'تكلفة', 'fee'],
      structure: null, clauses: ['شرط', 'بند', 'التزام', 'clause'], governing: ['قانون', 'تحكيم', 'اختصاص'],
      intro: null, framework: ['نظام', 'لائحة', 'قرار'], analysis: null,
      findings: null, refs: null, scope: null, controls: ['ضوابط', 'اشتراطات'], register: ['مخاطر', 'خطر']
    };
    const hint = hints[key];
    if (!hint) return passages.slice(0, 3);
    const matched = passages.filter(p => hint.some(h => p.text.toLowerCase().includes(h)));
    return matched.length ? matched.slice(0, 3) : passages.slice(0, 2);
  },

  async llmRun(agent, inputs, brief, kbRes, external) {
    const lang = I18n.lang;
    const llm = window.daaixSettings.llm;
    const template = agent.sections.map(s => `- ${s.title[lang] || s.title.ar}`).join('\n');

    const context = kbRes.passages.map((p, i) =>
      `[${i + 1}] (${p.docId}${p.articleNum ? ' — ' + p.articleNum : ''}) ${p.docTitle}\n${p.text}`
    ).join('\n\n');
    const extBlock = external.length
      ? '\n\nEXTERNAL SOURCES (label them as external in the output):\n' + external.map(e => `- (${e.name}): ${e.answer}`).join('\n')
      : '';

    const system = [
      lang === 'ar' ? 'أنت وكيل ذكاء اصطناعي قانوني في منصة DaAIx.' : 'You are a legal AI agent in the DaAIx platform.',
      lang === 'ar' ? `مهمتك: ${agent.desc.ar}` : `Your task: ${agent.desc.en}`,
      'STRICT RULES: Use ONLY the provided knowledge-base passages and external sources. Never invent laws, articles, numbers or dates. Cite passages inline with [n]. If a section lacks documented material, state that explicitly and keep it as a structured skeleton.',
      lang === 'ar' ? 'أجب بالعربية الفصحى بصيغة Markdown.' : 'Answer in English in Markdown.',
      `OUTPUT SECTIONS (follow exactly):\n${template}`
    ].join('\n');

    const history = (this.sessions[this.current] || []).slice(-6);

    try {
      const res = await fetch(llm.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llm.apiKey },
        body: JSON.stringify({
          model: llm.model || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            ...history.map(m => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content })),
            { role: 'user', content: `TASK:\n${brief}\n\nKNOWLEDGE BASE CONTEXT:\n${context}${extBlock}` }
          ]
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!answer) throw new Error('empty');
      return { markdown: answer, citations: kbRes.citations, mode: 'llm' };
    } catch (e) {
      const fallback = this.extractiveRun(agent, inputs, kbRes, external);
      fallback.mode = 'extractive-fallback';
      return fallback;
    }
  },

  renderOutput(result) {
    const out = document.getElementById('agentOutput');
    out.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'result-card agent-result';
    card.appendChild(renderMarkdown(result.markdown));

    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary';
    saveBtn.textContent = '💾 ' + I18n.t('importToNotes');
    saveBtn.onclick = async () => {
      const titleMatch = result.markdown.match(/^#\s+(.+)$/m);
      const id = 'agent-' + this.current + '-' + Date.now();
      await window.daaix.notesSave({ id, markdown: result.markdown });
      Notes.refresh();
      App.toast(I18n.t('save') + ' ✓');
    };

    const copyBtn = document.createElement('button');
    copyBtn.className = 'primary';
    copyBtn.textContent = '📋 ' + I18n.t('copy');
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(result.markdown).then(() => App.toast(I18n.t('copied')));
    };

    actions.appendChild(saveBtn);
    actions.appendChild(copyBtn);
    card.appendChild(actions);
    out.appendChild(card);
  }
};
