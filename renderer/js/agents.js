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

const AI_COMMANDS = [
  { id: 'summarize', icon: '\ud83d\udcdd', label: { ar: '\u062a\u0644\u062e\u064a\u0635', en: 'Summarize' }, prompt: { ar: '\u0644\u062e\u0651\u0635 \u0627\u0644\u0623\u0633\u0627\u0633 \u0627\u0644\u0646\u0638\u0627\u0645\u064a \u0644\u0644\u0645\u0648\u0636\u0648\u0639', en: 'Summarize the legal basis' } },
  { id: 'risks', icon: '\u26a0\ufe0f', label: { ar: '\u0627\u0644\u0645\u062e\u0627\u0637\u0631 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629', en: 'Key risks' }, prompt: { ar: '\u0627\u0630\u0643\u0631 \u0627\u0644\u0645\u062e\u0627\u0637\u0631 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629', en: 'List key risks' } },
  { id: 'steps', icon: '\ud83e\udddd', label: { ar: '\u062e\u0637\u0648\u0627\u062a \u062a\u0646\u0641\u064a\u0630\u064a\u0629', en: 'Action steps' }, prompt: { ar: '\u0627\u0642\u062a\u0631\u062d \u062e\u0637\u0648\u0627\u062a \u062a\u0646\u0641\u064a\u0630\u064a\u0629', en: 'Suggest action steps' } },
  { id: 'citations', icon: '\ud83d\udccc', label: { ar: '\u0627\u0644\u0627\u0633\u062a\u0634\u0647\u0627\u062f\u0627\u062a \u0641\u0642\u0637', en: 'Citations only' }, prompt: { ar: '\u0627\u0630\u0643\u0631 \u0627\u0644\u0646\u0635\u0648\u0635 \u0648\u0627\u0644\u0627\u0633\u062a\u0634\u0647\u0627\u062f\u0627\u062a \u0627\u0644\u0645\u0648\u062b\u0642\u0629 \u0641\u0642\u0637 \u062f\u0648\u0646 \u062a\u062d\u0644\u064a\u0644', en: 'List only documented texts and citations' } },
  { id: 'versions', icon: '\ud83d\udd52', label: { ar: '\u0645\u0642\u0627\u0631\u0646\u0629 \u0627\u0644\u0625\u0635\u062f\u0627\u0631\u0627\u062a', en: 'Compare versions' }, prompt: { ar: '\u0642\u0627\u0631\u0646 \u0628\u064a\u0646 \u0625\u0635\u062f\u0627\u0631\u0627\u062a \u0627\u0644\u0648\u062b\u064a\u0642\u0629 \u0648\u0627\u0630\u0643\u0631 \u0627\u0644\u062a\u0639\u062f\u064a\u0644\u0627\u062a', en: 'Compare document versions and list amendments' } },
  { id: 'relations', icon: '\ud83d\udd78\ufe0f', label: { ar: '\u0627\u0644\u0627\u0631\u062a\u0628\u0627\u0637\u0627\u062a \u0648\u0627\u0644\u0623\u062d\u0643\u0627\u0645', en: 'Relations & rulings' }, prompt: { ar: '\u0627\u0630\u0643\u0631 \u0627\u0631\u062a\u0628\u0627\u0637\u0627\u062a \u0627\u0644\u0648\u062b\u064a\u0642\u0629 \u0648\u0627\u0644\u0623\u062d\u0643\u0627\u0645 \u0627\u0644\u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0647\u0627', en: 'List document relations and related rulings' } }
];

const AI_SKILLS = [
  { id: 'x-search', icon: '\u2315', agent: 'research', label: { ar: '\u0627\u0644\u0628\u062d\u062b \u0641\u064a \u0645\u0646\u0635\u0629 X', en: 'Search on X' }, desc: { ar: '\u0628\u062d\u062b \u0645\u0648\u0636\u0648\u0639 \u0641\u064a \u0645\u0646\u0635\u0629 X \u0645\u0639 \u062a\u0631\u062c\u064a\u062d \u0627\u0644\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u0646\u0638\u0627\u0645\u064a\u0629 \u0645\u0646 \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629.', en: 'Search a topic on the X platform, grounded in the KB.' }, prompt: { ar: '\u0627\u0628\u062d\u062b \u0641\u064a \u0645\u0646\u0635\u0629 X \u0639\u0646 \u0627\u0644\u0645\u0648\u0636\u0648\u0639 \u0627\u0644\u062a\u0627\u0644\u064a \u0648\u0644\u062e\u0651\u0635 \u0623\u0647\u0645 \u0645\u0627 \u0648\u0631\u062f \u0645\u0639 \u0627\u0644\u0623\u0633\u0627\u0646\u064a\u062f \u0627\u0644\u0646\u0638\u0627\u0645\u064a\u0629:', en: 'Search on the X platform for the following topic and summarize the findings with legal grounds:' } },
  { id: 'memo', icon: '\u270e', agent: 'memo', label: { ar: '\u0625\u0639\u062f\u0627\u062f \u0645\u0630\u0643\u0631\u0629', en: 'Memo drafting' }, desc: { ar: '\u0625\u0639\u062f\u0627\u062f \u0645\u0630\u0643\u0631\u0629 \u062f\u0639\u0648\u0649 \u0623\u0648 \u0631\u062f \u0623\u0648 \u062f\u0641\u0648\u0639 \u0648\u0641\u0642 \u0627\u0644\u0646\u0645\u0627\u0630\u062c \u0627\u0644\u0642\u0636\u0627\u0626\u064a\u0629.', en: 'Draft a claim, reply or defense memo per judicial templates.' }, prompt: { ar: '\u0623\u0639\u062f \u0645\u0630\u0643\u0631\u0629 \u0642\u0636\u0627\u0626\u064a\u0629 \u062d\u0648\u0644 \u0627\u0644\u0645\u0648\u0636\u0648\u0639 \u0627\u0644\u062a\u0627\u0644\u064a \u0645\u0639 \u0627\u0644\u0623\u0633\u0627\u0646\u064a\u062f \u0627\u0644\u0646\u0638\u0627\u0645\u064a\u0629 \u0645\u0646 \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629:', en: 'Prepare a legal memo on the following topic with grounds from the KB:' } },
  { id: 'writing', icon: '\u00b6', agent: 'consultant', label: { ar: '\u0643\u062a\u0627\u0628\u0629 \u062e\u0637\u0627\u0628 \u0623\u0648 \u0635\u062d\u064a\u0641\u0629 \u062f\u0639\u0648\u0649', en: 'Letter / claim statement' }, desc: { ar: '\u0643\u062a\u0627\u0628\u0629 \u062e\u0637\u0627\u0628 \u0631\u0633\u0645\u064a \u0623\u0648 \u0635\u062d\u064a\u0641\u0629 \u062f\u0639\u0648\u0649 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0623\u0648 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629.', en: 'Write a formal letter or a claim statement in Arabic or English.' }, prompt: { ar: '\u0627\u0643\u062a\u0628 \u062e\u0637\u0627\u0628\u0627\u064b \u0631\u0633\u0645\u064a\u064b\u0627 \u0623\u0648 \u0635\u062d\u064a\u0641\u0629 \u062f\u0639\u0648\u0649 \u062d\u0648\u0644 \u0627\u0644\u0645\u0648\u0636\u0648\u0639 \u0627\u0644\u062a\u0627\u0644\u064a \u0628\u0644\u063a\u0629 \u0642\u0627\u0646\u0648\u0646\u064a\u0629 \u0645\u0631\u0643\u0651\u0628\u0629:', en: 'Write a formal letter or claim statement on the following topic in precise legal language:' } }
];

const AI_PROVIDERS = [
  { id: 'openai', name: { ar: 'أوبن أي', en: 'OpenAI' }, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'claude', name: { ar: 'كلاود', en: 'Claude' }, baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4' },
  { id: 'deepseek', name: { ar: 'ديب سيك', en: 'DeepSeek' }, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'gemini', name: { ar: 'جيميناي', en: 'Gemini' }, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
  { id: 'custom', name: { ar: 'مخصص', en: 'Custom' }, baseUrl: '', model: '' }
];

const ASSISTANT = { id: 'daaix', icon: '✨', name: { ar: 'AI DaAIx', en: 'AI DaAIx' } };

const Usage = {
  KEY: 'daaix-usage',
  stages: [
    { id: 'hourly', ms: 3600e3 },
    { id: 'daily', ms: 86400e3 },
    { id: 'weekly', ms: 7 * 86400e3 },
    { id: 'monthly', ms: 30 * 86400e3 }
  ],

  limits() {
    const u = (typeof App !== 'undefined' && App.settings && App.settings.usage) || {};
    return { hourly: u.hourly || 100, daily: u.daily || 500, weekly: u.weekly || 2000, monthly: u.monthly || 5000 };
  },

  read() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { return {}; }
  },

  write(d) {
    try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable */ }
  },

  bump() {
    const now = Date.now();
    const d = this.read();
    this.stages.forEach(st => {
      const cur = d[st.id];
      if (!cur || !cur.resetAt || cur.resetAt <= now) d[st.id] = { count: 0, resetAt: now + st.ms };
      d[st.id].count += 1;
    });
    this.write(d);
    this.renderMeter();
  },

  remaining() {
    const now = Date.now();
    const d = this.read();
    const lim = this.limits();
    return this.stages.map(st => {
      const cur = d[st.id];
      const used = cur && cur.resetAt > now ? cur.count : 0;
      return { id: st.id, used, limit: lim[st.id], left: Math.max(0, lim[st.id] - used) };
    });
  },

  renderMeter() {
    const meter = document.getElementById('usageMeter');
    if (!meter) return;
    meter.innerHTML = '';
    this.remaining().forEach(r => {
      const span = document.createElement('span');
      span.className = 'usage-stage' + (r.left ? '' : ' exhausted');
      span.textContent = I18n.t('usage_' + r.id) + ': ' + r.left + '/' + r.limit;
      meter.appendChild(span);
    });
  }
};

const Agents = {
  current: null,
  sessions: {},
  logs: {},
  context: [],

  list() { return AGENTS; },

  visible() {
    const on = (typeof App !== 'undefined' && App.settings && App.settings.agentsEnabled) || {};
    return AGENTS.filter(a => on[a.id] !== false);
  },

  get(id) { return AGENTS.find(a => a.id === id); },

  open(id) {
    this.current = id || AGENTS[0].id;
    App.openTab({ kind: 'agents' });
  },

  renderMenu() {
    const menu = document.getElementById('agentsMenu');
    if (!menu) return;
    this.visible().forEach(a => {
      const chip = document.createElement('div');
      chip.className = 'tool-chip' + (this.current === a.id ? ' active' : '');
      chip.textContent = `${a.icon} ${a.label[I18n.lang] || a.label.ar}`;
      chip.onclick = () => { this.current = a.id; this.renderMenu(); this.render(); };
      menu.appendChild(chip);
    });
  },

  activeLlm() {
    const s = (typeof window !== 'undefined' && window.daaixSettings) || {};
    const provs = s.providers || [];
    const act = provs.find(p => p.id === s.activeProvider && p.enabled !== false && p.apiKey && p.baseUrl);
    if (act) return { baseUrl: act.baseUrl, apiKey: act.apiKey, model: act.model };
    return s.llm || {};
  },

  commands() { return AI_COMMANDS; },

  skills() { return AI_SKILLS; },

  allSkills() {
    const builtin = AI_SKILLS.map(sk => ({
      id: sk.id, icon: sk.icon, agent: sk.agent, model: '',
      name: sk.label.en, instructions: sk.prompt.en
    }));
    const custom = ((typeof App !== 'undefined' && App.settings && App.settings.customSkills) || [])
      .map(sk => ({ id: sk.id, icon: '\u2728', agent: sk.agent, model: sk.model || '', name: sk.name, description: sk.description || '', instructions: sk.instructions || '' }));
    return builtin.concat(custom);
  },

  skillById(id) { return this.allSkills().find(sk => sk.id === id) || null; },

  skillToMarkdown(sk) {
    return ['---', 'name: ' + (sk.name || ''), 'description: ' + (sk.description || ''), '---', '', sk.instructions || ''].join('\n');
  },

  skillFromMarkdown(md) {
    const text = String(md || '');
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta = {};
    let body = text;
    if (m) {
      m[1].split(/\r?\n/).forEach(l => {
        const i = l.indexOf(':');
        if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim();
      });
      body = m[2];
    }
    return { name: meta.name || '', description: meta.description || '', instructions: body.trim() };
  },

  /* Copilot-style chat interface: ask anything, # for a KB/file, @ for context, / for commands */
  render() {
    const ws = document.getElementById('agentWorkspace');
    ws.innerHTML = '';

    const log = document.createElement('div');
    log.id = 'agentLog';
    log.className = 'chat-log agent-log';
    ws.appendChild(log);

    const ctxWrap = document.createElement('div');
    ctxWrap.className = 'agent-ctx';
    const chips = document.createElement('div');
    chips.className = 'ctx-chips';
    chips.id = 'ctxChips';
    ctxWrap.appendChild(chips);
    const popup = document.createElement('div');
    popup.id = 'ctxPopup';
    popup.className = 'ctx-popup hidden';
    ctxWrap.appendChild(popup);
    const cmdPopup = document.createElement('div');
    cmdPopup.id = 'cmdPopup';
    cmdPopup.className = 'ctx-popup hidden';
    ctxWrap.appendChild(cmdPopup);
    const plusPopup = document.createElement('div');
    plusPopup.id = 'plusPopup';
    plusPopup.className = 'ctx-popup hidden';
    ctxWrap.appendChild(plusPopup);
    ws.appendChild(ctxWrap);
    this.renderCtxChips(chips);

    const meter = document.createElement('div');
    meter.id = 'usageMeter';
    meter.className = 'usage-meter';
    ws.appendChild(meter);
    Usage.renderMeter();

    const row = document.createElement('div');
    row.className = 'chat-input-row agent-input-row';
    const input = document.createElement('textarea');
    input.id = 'agentInput';
    input.rows = 2;
    input.placeholder = I18n.t('agentAsk');
    const send = document.createElement('button');
    send.className = 'primary';
    send.id = 'agentSend';
    send.textContent = '↑';
    const plus = document.createElement('button');
    plus.id = 'chatPlusBtn';
    plus.className = 'chat-plus-btn';
    plus.textContent = '+';
    plus.title = I18n.t('addContextPlus');
    row.appendChild(input);
    row.appendChild(plus);
    row.appendChild(send);
    ws.appendChild(row);

    input.addEventListener('input', () => {
      send.classList.toggle('ready', !!input.value.trim());
      const v = input.value;
      if (v.startsWith('/')) {
        popup.classList.add('hidden');
        plusPopup.classList.add('hidden');
        this.renderCmdPopup(input, cmdPopup);
      } else {
        cmdPopup.classList.add('hidden');
        const trig = v.lastIndexOf('#') > v.lastIndexOf('@') ? '#' : '@';
        this.renderCtxPopup(input, popup, chips, trig);
      }
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { popup.classList.add('hidden'); cmdPopup.classList.add('hidden'); plusPopup.classList.add('hidden'); }, 200);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    send.onclick = () => this.send();

    plus.onclick = () => {
      if (plusPopup.classList.contains('hidden')) this.renderCtxPopup(input, plusPopup, chips, '', true);
      else plusPopup.classList.add('hidden');
    };

    this.restoreLog(log);
  },

  renderCmdPopup(input, popup) {
    popup.innerHTML = '';
    this.commands().forEach(c => {
      const label = c.prompt[I18n.lang] || c.prompt.ar;
      const b = document.createElement('button');
      b.className = 'ctx-item';
      b.innerHTML = `<span>${c.icon} ${esc(label)}</span>`;
      b.onmousedown = (e) => {
        e.preventDefault();
        input.value = label;
        popup.classList.add('hidden');
        input.focus();
      };
      popup.appendChild(b);
    });
    popup.classList.remove('hidden');
  },

  renderCtxPopup(input, popup, chips, trigger = '@', all = false) {
    const v = input.value;
    const at = all ? -1 : v.lastIndexOf(trigger);
    if (!all && at < 0) { popup.classList.add('hidden'); return; }
    const q = all ? '' : v.slice(at + 1).trim().toLowerCase();
    const items = [];
    if (trigger === '@') {
      this.allSkills().forEach(sk => {
        if (!q || sk.name.toLowerCase().includes(q)) {
          items.push({ type: 'skill', id: sk.id, label: `✨ ${sk.name}`, sub: I18n.t('ctxSkill') });
        }
      });
    } else {
      KB.kbs.forEach(kb => {
        const name = kb.name[I18n.lang] || kb.name.ar;
        if (!q || name.toLowerCase().includes(q)) {
          items.push({ type: 'kb', id: kb.id, label: `📚 ${name}`, sub: I18n.t('ctxKb') });
        }
      });
      KB.index.forEach(e => {
        const name = e.doc.title[I18n.lang] || e.doc.title.ar || e.doc.title.en;
        if (!q || name.toLowerCase().includes(q)) {
          items.push({ type: 'doc', id: e.doc.id, label: `📄 ${name}`, sub: I18n.docTypeName(e.doc.type) });
        }
      });
    }
    popup.innerHTML = '';
    items.slice(0, 8).forEach(it => {
      const b = document.createElement('button');
      b.className = 'ctx-item';
      b.innerHTML = `<span>${esc(it.label)}</span><span class="ctx-sub">${esc(it.sub)}</span>`;
      b.onmousedown = (e) => {
        e.preventDefault();
        this.context.push({ type: it.type, id: it.id, label: it.label, sub: it.sub });
        input.value = (v.slice(0, at) + v.slice(at + 1)).replace(/[@#]\s*$/, '').trim();
        popup.classList.add('hidden');
        this.renderCtxChips(chips);
      };
      popup.appendChild(b);
    });
    popup.classList.toggle('hidden', !items.length);
  },

  renderCtxChips(chips) {
    chips.innerHTML = '';
    this.context.forEach((c, i) => {
      const chip = document.createElement('span');
      chip.className = 'ctx-chip';
      chip.innerHTML = `${esc(c.label)} <span class="ctx-sub">${esc(c.sub)}</span> <button class="ctx-del">✕</button>`;
      chip.querySelector('.ctx-del').onclick = () => {
        this.context.splice(i, 1);
        this.renderCtxChips(chips);
      };
      chips.appendChild(chip);
    });
  },

  contextScopeIds() {
    if (!this.context.length) return null;
    const ids = new Set();
    this.context.forEach(c => {
      if (c.type === 'doc') {
        Retrieval.scopeDocIds(c.id, 1).forEach(id => ids.add(id));
      } else if (c.type === 'kb') {
        KB.index.forEach(e => { if (e.kbId === c.id) ids.add(e.doc.id); });
      }
    });
    return ids.size ? ids : new Set(['__none__']);
  },

  restoreLog(log) {
    (this.logs[this.current] || []).forEach(entry => {
      const qEl = document.createElement('div');
      qEl.className = 'chat-q';
      qEl.textContent = entry.q;
      log.appendChild(qEl);
      const aEl = document.createElement('div');
      aEl.className = 'chat-a';
      this.appendAnswer(aEl, entry.md, entry.sources || []);
      log.appendChild(aEl);
    });
    log.scrollTop = log.scrollHeight;
  },

  appendAnswer(out, markdown, sources, citations) {
    const unique = [...new Set(sources || [])];
    if (unique.length) {
      const src = document.createElement('div');
      src.className = 'chat-sources';
      src.innerHTML = `<span class="src-label">${esc(I18n.t('sourcesBased'))}</span>` +
        unique.map(t => `<span class="src-title">${esc(t)}</span>`).join('');
      out.appendChild(src);
    }
    out.appendChild(renderMarkdown(markdown));
    this.wireCites(out, citations);
  },

  wireCites(out, citations) {
    if (!citations || !citations.length) return;
    out.querySelectorAll('.cite').forEach(el => {
      const n = parseInt(el.getAttribute('data-cite'), 10);
      const c = citations[n - 1];
      if (!c || !c.docId) return;
      el.classList.add('cite-link');
      el.title = (c.docTitle || '') + (c.articleNum ? ' \u2014 ' + c.articleNum : '');
      el.onclick = () => App.navInTab({ kind: 'doc', docId: c.docId, article: c.articleNum || null });
    });
  },

  async send() {
    const input = document.getElementById('agentInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    const log = document.getElementById('agentLog');
    const agent = this.get(this.current);

    const qEl = document.createElement('div');
    qEl.className = 'chat-q';
    qEl.textContent = msg;
    log.appendChild(qEl);

    const out = document.createElement('div');
    out.className = 'chat-a';
    out.innerHTML = `<div class="hint">${I18n.t('loading')}</div>`;
    log.appendChild(out);
    log.scrollTop = log.scrollHeight;

    const skillChip = this.context.find(c => c.type === 'skill');
    const skill = skillChip ? this.skillById(skillChip.id) : null;
    if (skill) this.current = skill.agent;

    const scopeIds = this.contextScopeIds();
    const kbRes = Retrieval.extractiveAnswer(msg, { scopeDocIds: scopeIds, topK: 10 });

    let external = [];
    const connectors = ((window.daaixSettings || {}).connectors || []).filter(c => c.enabled !== false && c.url);
    for (const c of connectors) {
      try {
        const res = await window.daaix.netPost(c.url, c.apiKey || '', { query: msg });
        if (res && res.answer) external.push({ name: c.name || c.url, answer: String(res.answer) });
      } catch (e) { /* connector offline: skip */ }
    }

    let llm = this.activeLlm();
    if (skill && skill.model) llm = Object.assign({}, llm, { model: skill.model });
    const auto = skill && skill.automation ? skill.automation + '\n\n' : '';
    const fullMsg = skill && skill.instructions ? auto + skill.instructions + '\n\n' + msg : (auto ? auto + msg : msg);
    let result;
    if (llm.apiKey && llm.baseUrl) {
      result = await this.llmRun(agent, { message: fullMsg }, fullMsg, kbRes, external);
    } else {
      result = this.extractiveRun(agent, { message: fullMsg }, kbRes, external);
    }

    const sources = [...new Set((kbRes.citations || []).map(c => c.docTitle))];
    this.logs[this.current] = this.logs[this.current] || [];
    this.logs[this.current].push({ q: msg, md: result.markdown, sources });
    this.sessions[this.current] = this.sessions[this.current] || [];
    this.sessions[this.current].push({ role: 'user', content: msg });
    this.sessions[this.current].push({ role: 'agent', content: result.markdown });

    out.innerHTML = '';
    this.appendAnswer(out, result.markdown, sources, result.citations);
    const actions = document.createElement('div');
    actions.className = 'answer-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'act-icon mono';
    saveBtn.title = I18n.t('importToNotes');
    saveBtn.textContent = '\u2935';
    saveBtn.onclick = async () => {
      await window.daaix.notesSave({ id: 'agent-' + this.current + '-' + Date.now(), markdown: result.markdown });
      Notes.refresh();
      App.toast(I18n.t('save') + ' ✓');
    };
    const copyBtn = document.createElement('button');
    copyBtn.className = 'act-icon mono';
    copyBtn.title = I18n.t('copy');
    copyBtn.textContent = '\u2750';
    copyBtn.onclick = () => navigator.clipboard.writeText(result.markdown).then(() => App.toast(I18n.t('copied')));
    actions.appendChild(saveBtn);
    actions.appendChild(copyBtn);
    out.appendChild(actions);
    Usage.bump();
    log.scrollTop = log.scrollHeight;
  },

  extractiveRun(agent, inputs, kbRes, external) {
    const hasKb = (kbRes.passages || []).length > 0;
    if (!hasKb && !external.length) {
      return {
        markdown: `> [!WARNING]\n> ${I18n.t('chatNoAnswer')}`,
        citations: [],
        mode: 'extractive'
      };
    }

    const lines = [];
    (kbRes.passages || []).forEach(p => {
      lines.push(`> ${p.text}`);
      lines.push('');
    });
    if (external.length) {
      lines.push(`**${I18n.t('externalSources')}**`);
      lines.push('');
      external.forEach(e => {
        lines.push(`**${e.name}**`);
        lines.push(`> ${e.answer}`);
        lines.push('');
      });
    }
    lines.push('---');
    lines.push(`*${I18n.t('agentDisclaimer')}*`);

    return { markdown: lines.join('\n'), citations: kbRes.citations, mode: 'extractive' };
  },

  async llmRun(agent, inputs, brief, kbRes, external) {
    const lang = I18n.lang;
    const llm = window.daaixSettings.llm;

    const context = kbRes.passages.map((p, i) =>
      `[${i + 1}] (${p.docId}${p.articleNum ? ' — ' + p.articleNum : ''}) ${p.docTitle}\n${p.text}`
    ).join('\n\n');
    const extBlock = external.length
      ? '\n\nEXTERNAL SOURCES (label them as external in the output):\n' + external.map(e => `- (${e.name}): ${e.answer}`).join('\n')
      : '';

    const system = [
      lang === 'ar' ? 'أنت وكيل ذكاء اصطناعي قانوني في منصة DaAIx.' : 'You are a legal AI agent in the DaAIx platform.',
      lang === 'ar' ? `مهمتك: ${agent.desc.ar}` : `Your task: ${agent.desc.en}`,
      'STRICT RULES: Use ONLY the provided knowledge-base passages and external sources. Never invent laws, articles, numbers or dates. Cite passages inline with [n]. Answer concisely and directly — no rigid section templates. If the context does not contain the answer, reply exactly with the refusal sentence you are given below.',
      lang === 'ar' ? 'أجب بالعربية الفصحى بصيغة Markdown.' : 'Answer in English in Markdown.',
      `REFUSAL SENTENCE: ${I18n.t('chatNoAnswer')}`
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
  }
};
