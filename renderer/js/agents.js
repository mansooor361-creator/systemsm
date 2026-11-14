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

/* ---- v1.6.22: knowledge-assistant context engine (L1 system layer) ---- */
const ASSISTANT_MODES = [
  { id: 'auto', label: { ar: 'تلقائي', en: 'Auto' }, instructions: { ar: '', en: '' } },
  { id: 'write', label: { ar: 'الكتابة', en: 'Writing' }, instructions: {
    ar: 'وضع الكتابة: ابدأ بالمخطط ثم المسودة ثم المراجعة. التزم بأسلوب المستخدم إن وُجد دليل أسلوب. لا تعدّل إلا عبر diff. وفّر خيارات نبرة (رسمي، مبسّط، مقنع). احفظ المعنى عند الترجمة والإعادة الصياغة.',
    en: 'Writing mode: outline first, then draft, then review. Follow the user style guide if present. Edits only via diff. Offer tone options (formal, simple, persuasive). Preserve meaning when translating or rephrasing.' } },
  { id: 'study', label: { ar: 'الدراسة', en: 'Study' }, instructions: {
    ar: 'وضع الدراسة: لخّص بمستويات (سطر، فقرة، صفحة). ولّد بطاقات مراجعة (سؤال/جواب). أنشئ اختبارات متدرجة الصعوبة مع تصحيح وشرح. اشرح بطريقة فاينمان. اقترح خطة مراجعة متباعدة. اربط المفاهيم بروابط [[ ]] بين الوثائق.',
    en: 'Study mode: summarize at levels (line, paragraph, page). Generate flashcards (Q/A). Create graded quizzes with correction and explanation. Explain the Feynman way. Suggest a spaced-repetition plan. Link concepts with [[ ]] between documents.' } },
  { id: 'analyze', label: { ar: 'التحليل', en: 'Analysis' }, instructions: {
    ar: 'وضع التحليل: قارن بين مستندين أو أكثر في جدول (البند، المصدر أ، المصدر ب، الاختلاف). استخرج الجداول والجداول الزمنية والتناقضات. لكل استنتاج اذكر الدليل ودرجة الثقة (عالية/متوسطة/منخفضة) وما الذي يغيّرها.',
    en: 'Analysis mode: compare two or more documents in a table (item, source A, source B, difference). Extract tables, timelines and contradictions. For each conclusion cite the evidence and confidence (high/medium/low) and what would change it.' } },
  { id: 'legal', label: { ar: 'المعلومات القانونية', en: 'Legal information' }, instructions: {
    ar: 'وضع المعلومات القانونية (مساعد بحث ومعلومات، وليس محامياً): لا تؤسس علاقة محامٍ\u2013موكل ولا تَعِد بنتيجة. حدّد الاختصاص القضائي (الدولة/النظام) وإن غاب فاسأل قبل التحليل ولا تفترضه، واسأل عن تاريخ الوقائع إن كان له أثر. المنهج: الوقائع ثم المسائل القانونية ثم القاعدة (نص المادة مع رقمها واسم النظام وتاريخه من المستودع) ثم التطبيق ثم الخلاصة والخيارات ثم المخاطر وعدم اليقين ثم الخطوات التالية والمستندات الناقصة. اقتبس النصوص القانونية من المستودع حرفياً مع الاستشهاد بالمصدر؛ وإن لم يوجد نص فقل ذلك صراحة ووسّم المعلومة العامة بـ«غير موثّقة من المستودع». لا تختلق مواد أو أرقام قضايا أو أحكاماً. نبّه إن تأثرت المسألة بتعديل أو إلغاء. رتّب مصادر القواعد (دستور/نظام/لائحة/تعميم/سابقة) وبيّن التعارض. أحِل إلى محامٍ مرخّص عند مواعيد التقادم أو الخطر الجنائي أو المبالغ الكبيرة أو التوقيع على عقد أو مستند رسمي، بجملة تنبيه واحدة قصيرة. أشكال المخرجات: مذكرة قانونية، جدول مراجعة عقد (البند، الخطر، الاقتراح)، قائمة امتثال، خط زمني للوقائع.',
    en: 'Legal-information mode (research assistant, not a lawyer): never form an attorney-client relationship nor promise outcomes. Determine jurisdiction (country/law); if absent, ask before analyzing and never assume; ask about the facts date when the then-applicable law matters. Method: facts, then legal issues, then the rule (article text with number, law name and date from the KB), then application, then conclusion and options, then risks and uncertainty, then next steps and missing documents. Quote legal texts from the KB verbatim with citations; if not found, say so explicitly and tag general information as "not verified from the KB". Never invent articles, case numbers or rulings. Warn when the matter may be affected by amendment or repeal. Order rule sources (constitution/law/regulation/circular/precedent) and show conflicts. Refer to a licensed lawyer on limitation periods, criminal risk, large amounts, or signing a contract/official document \u2014 one short notice. Output forms: legal memo, contract review table (clause, risk, suggestion), compliance checklist, facts timeline.' } }
];

const SYSTEM_RULES = {
  ar: [
    'أنت مساعد معرفي داخل تطبيق DaAIx.',
    '1. أجب بلغة رسالة المستخدم.',
    '2. إذا ذكر المستخدم «ملاحظة» فالمقصود وثيقة في قاعدة المعرفة.',
    '3. اعتمد على السياق المقدَّم والأدوات؛ ولا تقل إنك لا تملك وصولاً لشيء قبل أن تجرب البحث المناسب.',
    '4. إن لم تكن متأكداً فقل ذلك واطلب سياقاً إضافياً. لا تختلق معلومة أو رقماً أو مصدراً.',
    '5. اعرض عناوين الوثائق بصيغة [[العنوان]] دون علامات اقتباس برمجية.',
    '6. الجداول بصيغة GitHub Markdown.',
    '7. لا تعدّل وثيقة إلا عند طلب صريح.',
    '8. ميّز دائماً بين: (أ) ما قالته مصادر قاعدة المعرفة، (ب) تحليلك، (ج) معرفتك العامة غير الموثّقة.',
    '9. لا تذكر السياق الإضافي إن لم يكن ذا صلة.',
    '10. استشهد فقط بالمعلومات المنقولة أو الأرقام أو الاقتباسات (1\u20133 لكل فقرة)، ولا تستشهد بتحليلك الخاص أو المعارف العامة.'
  ].join('\n'),
  en: [
    'You are a knowledge assistant inside the DaAIx app.',
    '1. Answer in the language of the user message.',
    '2. When the user says "note", they mean a document in the knowledge base.',
    '3. Rely on the provided context and tools; never claim you lack access before trying the appropriate search.',
    '4. If unsure, say so and ask for more context. Never invent a fact, number or source.',
    '5. Show document titles as [[Title]] without code quotes.',
    '6. Tables in GitHub Markdown.',
    '7. Never edit a document unless explicitly asked.',
    '8. Always distinguish: (a) what KB sources said, (b) your analysis, (c) your general undocumented knowledge.',
    '9. Omit auxiliary context when irrelevant.',
    '10. Cite only transferred information, numbers or quotes (1\u20133 per paragraph); never cite your own analysis or general knowledge.'
  ].join('\n')
};

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

  /* ---- v1.6.22: modes, projects, memory, L1 system layer ---- */
  mode: 'auto',
  project: null,
  busy: false,
  stopRequested: false,

  settings() {
    return (typeof App !== 'undefined' && App.settings) || {};
  },

  assistantMemory() {
    const s = this.settings();
    if (!s.assistantMemory) s.assistantMemory = { recent: true, saved: true, maxRecent: 30, recentList: [], savedList: [] };
    return s.assistantMemory;
  },

  projects() { return this.settings().assistantProjects || []; },

  currentProject() { return this.projects().find(p => p.name === this.project) || null; },

  projectMarkdown(p) {
    const ctx = (p.context || []).map(c => '- ' + c).join('\n');
    return ['# ' + p.name, '', p.description || '', '', '## \u0627\u0644\u0633\u064a\u0627\u0642 \u0627\u0644\u0645\u0631\u062a\u0628\u0637', ctx || '- \u2014', ''].join('\n');
  },

  async saveProjectToDisk(p) {
    if (!window.daaix || !window.daaix.projectsSave) return;
    try { await window.daaix.projectsSave(p.name, this.projectMarkdown(p), p.instructions || ''); } catch (e) { /* disk unavailable */ }
  },

  async saveProject(name, description, instructions) {
    const list = this.settings().assistantProjects = this.settings().assistantProjects || [];
    let p = list.find(x => x.name === name);
    if (!p) { p = { id: 'proj-' + Date.now(), name, description: '', instructions: '', context: [] }; list.push(p); }
    p.description = description || '';
    p.instructions = instructions || '';
    if (window.daaix && window.daaix.settingsSet) await window.daaix.settingsSet({ assistantProjects: list });
    await this.saveProjectToDisk(p);
    return p;
  },

  async deleteProject(name) {
    const s = this.settings();
    s.assistantProjects = (s.assistantProjects || []).filter(p => p.name !== name);
    if (window.daaix && window.daaix.settingsSet) await window.daaix.settingsSet({ assistantProjects: s.assistantProjects });
    if (window.daaix && window.daaix.projectsDelete) { try { await window.daaix.projectsDelete(name); } catch (e) {} }
    if (this.project === name) this.project = null;
  },

  systemInstructions() {
    const lang = I18n.lang;
    const parts = [SYSTEM_RULES[lang] || SYSTEM_RULES.ar];
    const mode = ASSISTANT_MODES.find(m => m.id === this.mode);
    if (mode && mode.instructions && mode.instructions[lang]) parts.push(mode.instructions[lang]);
    const p = this.currentProject();
    if (p && p.instructions) parts.push((lang === 'ar' ? '\u062a\u0639\u0644\u064a\u0645\u0627\u062a \u0627\u0644\u0645\u0634\u0631\u0648\u0639 (' + p.name + '):\n' : 'Project instructions (' + p.name + '):\n') + p.instructions);
    const mem = this.assistantMemory();
    if (mem.recent && mem.recentList && mem.recentList.length) {
      const lines = mem.recentList.slice(0, mem.maxRecent || 30).map(r => '- ' + r.title + (r.summary ? ': ' + r.summary : ''));
      parts.push((lang === 'ar' ? '\u0645\u062d\u0627\u062f\u0627\u062a\u062d \u062d\u062f\u064a\u062b\u0629:\n' : 'Recent conversations:\n') + lines.join('\n'));
    }
    if (mem.saved && mem.savedList && mem.savedList.length) {
      const lines = mem.savedList.map(r => '- ' + r.text);
      parts.push((lang === 'ar' ? '\u0630\u0643\u0631\u064a\u0627\u062a \u0645\u062d\u0641\u0648\u0638\u0629:\n' : 'Saved memories:\n') + lines.join('\n'));
    }
    return parts.join('\n\n');
  },

  rememberSession(q, answerMd) {
    const mem = this.assistantMemory();
    if (!mem.recent) return;
    if (!mem.recentList) mem.recentList = [];
    const title = String(q || '').split(/\s+/).slice(0, 8).join(' ');
    const summary = String(answerMd || '').replace(/[#*`>\[\]]/g, '').split(/(?<=[.!\u061f\u0640])\s+/).slice(0, 3).join(' ').slice(0, 220);
    const existing = mem.recentList.find(r => r.title === title);
    if (existing) { existing.summary = summary; existing.at = Date.now(); }
    else mem.recentList.unshift({ title, summary, at: Date.now() });
    mem.recentList = mem.recentList.slice(0, mem.maxRecent || 30);
    if (window.daaix && window.daaix.settingsSet) window.daaix.settingsSet({ assistantMemory: mem });
  },

  async saveMemoryPoint(text) {
    const mem = this.assistantMemory();
    if (!mem.saved || !text) return false;
    if (!mem.savedList) mem.savedList = [];
    const t = String(text).trim().slice(0, 300);
    if (mem.savedList.some(r => r.text === t)) return false;
    mem.savedList.unshift({ text: t, at: Date.now() });
    if (window.daaix && window.daaix.settingsSet) await window.daaix.settingsSet({ assistantMemory: mem });
    return true;
  },


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
    const hidden = ((typeof App !== 'undefined' && App.settings && App.settings.hiddenBuiltinSkills) || []);
    const builtin = AI_SKILLS.filter(sk => !hidden.includes(sk.id)).map(sk => ({
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

    /* full-page classic topbar: mode picker + project picker + project actions */
    const top = document.createElement('div');
    top.className = 'agent-topbar';
    const modeSel = document.createElement('select');
    modeSel.id = 'agentModeSelect';
    modeSel.title = I18n.t('modePick');
    ASSISTANT_MODES.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = (m.id === 'legal' ? '\u2696 ' : '') + (m.label[I18n.lang] || m.label.ar);
      if (this.mode === m.id) o.selected = true;
      modeSel.appendChild(o);
    });
    modeSel.onchange = () => { this.mode = modeSel.value; };
    top.appendChild(modeSel);

    const projSel = document.createElement('select');
    projSel.id = 'agentProjectSelect';
    projSel.title = I18n.t('projPick');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '\u2014 ' + I18n.t('projNone') + ' \u2014';
    projSel.appendChild(none);
    this.projects().forEach(p => {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      if (this.project === p.name) o.selected = true;
      projSel.appendChild(o);
    });
    projSel.onchange = () => { this.project = projSel.value || null; };
    top.appendChild(projSel);

    const bNew = document.createElement('button');
    bNew.id = 'btnProjectNew';
    bNew.className = 'ghost-btn';
    bNew.textContent = '+ ' + I18n.t('projNew');
    bNew.onclick = async () => {
      const name = (window.prompt(I18n.t('projName')) || '').trim();
      if (!name) return;
      const instr = (window.prompt(I18n.t('projInstr')) || '').trim();
      await this.saveProject(name, '', instr);
      this.project = name;
      this.render();
    };
    top.appendChild(bNew);

    const bEdit = document.createElement('button');
    bEdit.id = 'btnProjectEdit';
    bEdit.className = 'ghost-btn';
    bEdit.textContent = I18n.t('projSave');
    bEdit.onclick = async () => {
      if (!this.project) return;
      const p = this.currentProject();
      const instr = (window.prompt(I18n.t('projInstr'), p ? p.instructions : '') || '').trim();
      if (instr === null || instr === '') return;
      await this.saveProject(this.project, p ? p.description : '', instr);
      this.render();
    };
    top.appendChild(bEdit);

    const bDel = document.createElement('button');
    bDel.id = 'btnProjectDelete';
    bDel.className = 'ghost-btn';
    bDel.textContent = '\u00d7 ' + I18n.t('projDelete');
    bDel.onclick = async () => {
      if (!this.project) return;
      await this.deleteProject(this.project);
      this.render();
    };
    top.appendChild(bDel);

    ws.appendChild(top);

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
    const stop = document.createElement('button');
    stop.id = 'agentStop';
    stop.className = 'tb-btn mono hidden';
    stop.textContent = '⏹';
    stop.title = I18n.t('stopGen');
    stop.onclick = () => { this.stopRequested = true; };
    const plus = document.createElement('button');
    plus.id = 'chatPlusBtn';
    plus.className = 'chat-plus-btn';
    plus.textContent = '+';
    plus.title = I18n.t('addContextPlus');
    row.appendChild(input);
    row.appendChild(plus);
    row.appendChild(stop);
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
    let md = String(markdown || '');
    const srcDefs = [];
    md = md.replace(/^[ \t]*\[\^(\d+)\]:[ \t]*(.+)$/gm, (m, n, t) => { srcDefs[parseInt(n, 10) - 1] = t.trim(); return ''; });
    md = md.replace(/\[\^(\d+)\]/g, '[$1]');
    md = md.replace(/\n{3,}/g, '\n\n').replace(/^[ \t]*#{0,4}[ \t]*Sources[ \t]*$/gim, '').trim();
    const unique = [...new Set((sources || []).concat(srcDefs.filter(Boolean)))];
    if (unique.length) {
      const src = document.createElement('div');
      src.className = 'chat-sources';
      src.innerHTML = `<span class="src-label">${esc(I18n.t('sourcesBased'))}</span>` +
        unique.map(t => `<span class="src-title">${esc(t)}</span>`).join('');
      out.appendChild(src);
    }
    out.appendChild(renderMarkdown(md));
    this.wireCites(out, citations);
    const memBtn = document.createElement('button');
    memBtn.className = 'ghost-btn mem-save-btn';
    memBtn.textContent = '\u2398 ' + I18n.t('memSave');
    memBtn.title = I18n.t('memSaveTitle');
    memBtn.onclick = async () => {
      const ok = await this.saveMemoryPoint(out.textContent.replace(I18n.t('sourcesBased'), '').slice(0, 300));
      memBtn.textContent = ok ? ('\u2713 ' + I18n.t('memSaved')) : I18n.t('memDisabled');
    };
    out.appendChild(memBtn);
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
    if (this.busy) return;
    const input = document.getElementById('agentInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    const sendBtn = document.getElementById('agentSend');
    const stopBtn = document.getElementById('agentStop');
    this.busy = true;
    this.stopRequested = false;
    if (sendBtn) sendBtn.classList.remove('ready');
    if (stopBtn) stopBtn.classList.remove('hidden');
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

    if (this.stopRequested && out.querySelector('.hint')) out.querySelector('.hint').textContent = I18n.t('stopped');
    this.busy = false;
    if (stopBtn) stopBtn.classList.add('hidden');
    if (sendBtn) sendBtn.disabled = false;
    this.rememberSession(msg, result.markdown);
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
      this.systemInstructions(),
      lang === 'ar' ? 'أنت وكيل ذكاء اصطناعي قانوني في منصة DaAIx.' : 'You are a legal AI agent in the DaAIx platform.',
      lang === 'ar' ? `مهمتك: ${agent.desc.ar}` : `Your task: ${agent.desc.en}`,
      'STRICT RULES: Use ONLY the provided knowledge-base passages and external sources. Never invent laws, articles, numbers or dates. Cite passages inline with [n]. When the user asks about a specific text or searches for it, quote the matching passage VERBATIM from the context. Answer concisely and directly — no rigid section templates. If the context does not contain the answer, reply exactly with the refusal sentence you are given below.',
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
