'use strict';

const Tools = {
  active: null,

  list() {
    return [
      { id: 'converter', icon: '🔄', glyph: '\u21c4', label: I18n.t('toolConverter'), cat: 'free', desc: I18n.t('descConverter') },
      { id: 'costs', icon: '🧾', glyph: '\u2211', label: I18n.t('toolCosts'), cat: 'legal', desc: I18n.t('descCosts') },
      { id: 'labor', icon: '👷', glyph: '\u2692\ufe0e', label: I18n.t('toolLabor'), cat: 'legal', desc: I18n.t('descLabor') },
      { id: 'laborConsultant', icon: '🧑‍⚖️', glyph: '\u2695\ufe0e', label: I18n.t('toolLaborConsultant'), cat: 'legal', desc: I18n.t('descLaborConsultant') },
      { id: 'competition', icon: '🏆', glyph: '\u2694\ufe0e', label: I18n.t('toolCompetition'), cat: 'legal', desc: I18n.t('descCompetition') },
      { id: 'offers', icon: '📊', glyph: '\u25a4', label: I18n.t('toolOffers'), cat: 'legal', desc: I18n.t('descOffers') },
      { id: 'building', icon: '🏗️', glyph: '\u2302', label: I18n.t('toolBuilding'), cat: 'legal', desc: I18n.t('descBuilding') },
      { id: 'contract', icon: '📝', glyph: '\u00a7', label: I18n.t('toolContract'), cat: 'legal', desc: I18n.t('descContract') },
      { id: 'socialMonitor', icon: '📡', glyph: '\u25c9', label: I18n.t('toolSocial'), cat: 'ai', desc: I18n.t('socialDesc') },
      { id: 'whatsapp', icon: '💬', glyph: '\u2706\ufe0e', label: I18n.t('toolWhatsapp'), cat: 'ai', desc: I18n.t('waDesc') },
      /* v1.6.30: OCR engine powered by the AI agents — strongest scan for image text and document image extraction */
      { id: 'ocr', icon: '📷', glyph: '⌕', label: I18n.t('toolOcr'), cat: 'ai', desc: I18n.t('descOcr') }
    ];
  },

  renderMenu() {
    const menu = document.getElementById('toolsMenu');
    menu.innerHTML = '';
    const enabled = (typeof App !== 'undefined' && App.settings && App.settings.toolEnabled) || {};
    this.list().filter(t => enabled[t.id] !== false).forEach(t => {
      const chip = document.createElement('div');
      chip.className = 'tool-chip' + (this.active === t.id ? ' active' : '');
      chip.textContent = `${t.icon} ${t.label}`;
      chip.onclick = () => App.openTab({ kind: 'tools', toolId: t.id });
      menu.appendChild(chip);
    });
  },

  open(id) {
    App.openTab({ kind: 'tools', toolId: id });
  },

  render(id) {
    const panel = document.getElementById('toolPanel');
    panel.innerHTML = '';
    const fn = this['render_' + id];
    if (fn) fn.call(this, panel);
  },

  el(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.firstElementChild;
  },

  /* ============ 2. Markdown Converter ============ */
  async render_converter(panel) {
    const box = this.el(`
      <div>
        <h2>🔄 ${I18n.t('toolConverter')}</h2>
        <p class="hint" style="margin-bottom:14px">${I18n.t('pickFile')}</p>
        <button class="primary" id="cvPick">📂 ${I18n.t('pickFile')}</button>
        <div id="cvOut"></div>
      </div>`);
    panel.appendChild(box);
    box.querySelector('#cvPick').onclick = async () => {
      const file = await window.daaix.pickFile('Documents', ['pdf', 'docx', 'txt', 'md', 'html', 'htm']);
      if (!file) return;
      const out = box.querySelector('#cvOut');
      out.innerHTML = `<div class="result-card">${I18n.t('loading')}</div>`;
      const res = await window.daaix.convertToMarkdown({ path: file.path, data: file.data });
      out.innerHTML = '';
      if (!res.ok) {
        out.appendChild(this.el(`<div class="result-card" style="color:var(--danger)">${res.error}</div>`));
        return;
      }
      const md = res.markdown;
      const actions = this.el(`<div style="display:flex;gap:10px;margin-top:14px"></div>`);
      const importBtn = this.el(`<button class="primary">${I18n.t('importToNotes')}</button>`);
      importBtn.onclick = () => {
        const id = 'note-' + Date.now();
        const title = (md.match(/^#\s+(.+)$/m) || [, file.name])[1].trim().slice(0, 60);
        window.daaix.notesSave({ id, markdown: `# ${title}\n\n${md}` }).then(() => {
          App.toast(I18n.t('converted'));
          Notes.refresh();
        });
      };
      actions.appendChild(importBtn);
      out.appendChild(this.el(`<div class="result-note">${file.name} → Markdown (${md.length.toLocaleString()} chars)</div>`));
      out.appendChild(actions);
      const preview = this.el(`<div class="md-preview"></div>`);
      preview.appendChild(renderMarkdown(md));
      out.appendChild(preview);
    };
  },

  /* ============ 3. Court Costs ============ */
  render_costs(panel) {
    const box = this.el(`
      <div>
        <h2>🧾 ${I18n.t('toolCosts')}</h2>
        <div class="form-grid">
          <label>${I18n.t('claimAmount')} (${I18n.t('currency')})
            <input id="ccVal" type="number" min="0" value="100000" />
          </label>
          <label>${I18n.t('caseType')}
            <select id="ccType">
              <option value="claim">${I18n.t('claim')}</option>
              <option value="execution">${I18n.t('execution')}</option>
              <option value="fixed">${I18n.t('appeal')} / ${I18n.t('base')}</option>
            </select>
          </label>
          <label>${I18n.t('appeal')}
            <select id="ccAppeal"><option value="no">${I18n.t('no')}</option><option value="yes">${I18n.t('yes')}</option></select>
          </label>
          <label>${I18n.t('execution')}
            <select id="ccExec"><option value="no">${I18n.t('no')}</option><option value="yes">${I18n.t('yes')}</option></select>
          </label>
        </div>
        <button class="primary" id="ccGo">${I18n.t('calculate')}</button>
        <div id="ccOut"></div>
      </div>`);
    panel.appendChild(box);
    box.querySelector('#ccGo').onclick = () => {
      const r = Calc.courtCosts({
        claimValue: box.querySelector('#ccVal').value,
        caseType: box.querySelector('#ccType').value,
        appeal: box.querySelector('#ccAppeal').value === 'yes',
        execution: box.querySelector('#ccExec').value === 'yes'
      });
      const out = box.querySelector('#ccOut');
      out.innerHTML = '';
      const card = this.el(`<div class="result-card"><div class="big">${I18n.t('total')}: ${r.total.toLocaleString()} ${I18n.t('currency')}</div></div>`);
      r.lines.forEach(l => {
        card.appendChild(this.el(`<div class="result-line"><span>${l.label[I18n.lang] || l.label.ar}</span><span>${Math.round(l.amount).toLocaleString()} ${I18n.t('currency')}</span></div>`));
      });
      card.appendChild(this.el(`<div class="result-note">${I18n.lang === 'ar' ? 'تقدير إرشادي وفق لائحة الرسوم القضائية — الرسوم الفعلية تحددها وزارة العدل.' : 'Indicative estimate per the Judicial Fees Law — actual fees are set by the Ministry of Justice.'}</div>`));
      out.appendChild(card);
    };
  },

  /* ============ 4. Labor Calculator ============ */
  render_labor(panel) {
    const box = this.el(`
      <div>
        <h2>👷 ${I18n.t('toolLabor')}</h2>
        <div class="form-grid">
          <label>${I18n.t('salary')} (${I18n.t('currency')})<input id="lbSalary" type="number" min="0" value="10000" /></label>
          <label>${I18n.t('years')}<input id="lbYears" type="number" min="0" value="6" /></label>
          <label>${I18n.t('months')}<input id="lbMonths" type="number" min="0" max="11" value="0" /></label>
          <label>${I18n.t('result')}
            <select id="lbMode">
              <option value="termination">${I18n.t('termination')}</option>
              <option value="resignation">${I18n.t('resignation')}</option>
            </select>
          </label>
          <label>${I18n.t('type_agreement')} / ${I18n.t('number')}
            <select id="lbFixed"><option value="no">${I18n.t('no')}</option><option value="yes">${I18n.t('yes')}</option></select>
          </label>
        </div>
        <button class="primary" id="lbGo">${I18n.t('calculate')}</button>
        <div id="lbOut"></div>
      </div>`);
    panel.appendChild(box);
    box.querySelector('#lbGo').onclick = () => {
      const mode = box.querySelector('#lbMode').value;
      const fixed = box.querySelector('#lbFixed').value === 'yes';
      const r = Calc.endOfService({
        salary: box.querySelector('#lbSalary').value,
        years: box.querySelector('#lbYears').value,
        months: box.querySelector('#lbMonths').value,
        mode
      });
      const notice = Calc.notice({ mode, fixedTerm: fixed });
      const out = box.querySelector('#lbOut');
      out.innerHTML = '';
      const card = this.el(`<div class="result-card">
        <div class="big">${I18n.t('eosAward')}: ${r.award.toLocaleString()} ${I18n.t('currency')}</div>
        <div class="result-line"><span>${I18n.t('noticePeriod')}</span><span>${notice} ${I18n.lang === 'ar' ? 'يوم' : 'days'}</span></div>
      </div>`);
      card.appendChild(this.el(`<div class="result-note">${r.basis}</div>`));
      const link = this.el(`<div class="result-note"><a href="#" class="cite" style="color:var(--accent2)">📄 ${I18n.t('openDoc')}: ${I18n.t('type_law')} — نظام العمل (م/51)</a></div>`);
      link.querySelector('a').onclick = (e) => { e.preventDefault(); App.openDocument('sa-labor-law'); };
      card.appendChild(link);
      out.appendChild(card);
    };
  },

  /* ============ 5 & 6. Scoped consultants ============ */
  render_laborConsultant(panel) { this.render_consultantScoped(panel, 'laborConsultant', ['sa-labor-law', 'sa-reg-hr', 'sa-ruling-labor-1', 'sa-principle-hc-1']); },
  render_competition(panel) { this.render_consultantScoped(panel, 'competition', null, /منافسات|مشتريات|عطاء|منافسة|competition|procurement|tender/i); },

  render_consultantScoped(panel, id, docIds, titleRegex) {
    const labels = { laborConsultant: 'toolLaborConsultant', competition: 'toolCompetition' };
    const placeholders = { laborConsultant: 'consultantQuestion', competition: 'competitionQuestion' };
    const box = this.el(`
      <div>
        <h2>${id === 'laborConsultant' ? '🧑‍⚖️' : '🏆'} ${I18n.t(labels[id])}</h2>
        <div class="form-grid" style="grid-template-columns:1fr">
          <label>${I18n.t(placeholders[id])}
            <textarea id="scQ" rows="3" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;outline:none"></textarea>
          </label>
        </div>
        <button class="primary" id="scAsk">${I18n.t('calculate')}</button>
        <div id="scOut"></div>
      </div>`);
    panel.appendChild(box);
    box.querySelector('#scAsk').onclick = async () => {
      const q = box.querySelector('#scQ').value.trim();
      if (!q) return;
      const out = box.querySelector('#scOut');
      out.innerHTML = `<div class="result-card">${I18n.t('loading')}</div>`;
      const opts = docIds ? { scopeDocIds: new Set(docIds) } : {};
      const res = await Chat.answer(q, { scope: 'all', ...opts, titleRegex });
      out.innerHTML = '';
      const card = this.el(`<div class="result-card"></div>`);
      card.appendChild(renderMarkdown(res.answer));
      if (res.passages && res.passages.length) {
        const cites = this.el(`<div class="result-note">${I18n.t('chatCitations')}: </div>`);
        res.passages.forEach((p, i) => {
          const a = this.el(`<a href="#" class="cite">${p.docTitle}${p.articleNum ? ' (' + p.articleNum + ')' : ''}</a>`);
          a.onclick = (e) => { e.preventDefault(); App.openDocument(p.docId); };
          cites.appendChild(a);
          if (i < res.passages.length - 1) cites.appendChild(document.createTextNode(' · '));
        });
        card.appendChild(cites);
      }
      out.appendChild(card);
    };
  },

  /* ============ 7. Offers ============ */
  render_offers(panel) {
    const box = this.el(`
      <div>
        <h2>📊 ${I18n.t('toolOffers')}</h2>
        <div class="form-grid">
          <label>${I18n.t('offersBid')}<input id="ofBid" type="number" min="0" value="1200000" /></label>
          <label>${I18n.t('offersCost')}<input id="ofCost" type="number" min="0" value="950000" /></label>
          <label>${I18n.t('score')} — ${I18n.t('base')} 100: 40% ${I18n.t('offersBid')}<input id="ofTech" type="number" min="0" max="100" value="85" /></label>
          <label>${I18n.t('score')} — 20% ${I18n.t('years')}<input id="ofExp" type="number" min="0" max="100" value="70" /></label>
          <label>${I18n.t('winProbability')} — ${I18n.t('documentsPl')}<input id="ofComp" type="number" min="1" value="4" /></label>
        </div>
        <button class="primary" id="ofGo">${I18n.t('evaluate')}</button>
        <div id="ofOut"></div>
      </div>`);
    panel.appendChild(box);
    box.querySelector('#ofGo').onclick = () => {
      const r = Calc.bid({
        bidValue: box.querySelector('#ofBid').value,
        estCost: box.querySelector('#ofCost').value,
        technical: box.querySelector('#ofTech').value,
        experience: box.querySelector('#ofExp').value,
        competitors: box.querySelector('#ofComp').value
      });
      const verdicts = {
        low_margin: { ar: 'هامش منخفض — خطر على الربحية', en: 'Low margin — profitability risk' },
        healthy: { ar: 'هامش صحي', en: 'Healthy margin' },
        high_margin: { ar: 'هامش مرتفع — قد يقلل فرصة الفوز', en: 'High margin — may reduce win chance' }
      };
      const v = verdicts[r.verdict];
      const card = this.el(`<div class="result-card">
        <div class="result-line"><span>${I18n.t('margin')}</span><span>${r.margin}%</span></div>
        <div class="result-line"><span>${I18n.t('score')}</span><span>${r.score} / 100</span></div>
        <div class="result-line"><span>${I18n.t('winProbability')}</span><span>${r.winProbability}%</span></div>
        <div class="result-note">${v[I18n.lang] || v.ar}</div>
      </div>`);
      box.querySelector('#ofOut').innerHTML = '';
      box.querySelector('#ofOut').appendChild(card);
    };
  },

  /* ============ 8. Building ============ */
  render_building(panel) {
    const stages = Calc.buildingStages(I18n.lang);
    const box = this.el(`<div><h2>🏗️ ${I18n.t('toolBuilding')}</h2><div id="blStages"></div>
      <div class="progress"><div id="blBar" style="width:0%"></div></div>
      <div id="blPct" class="result-note"></div></div>`);
    panel.appendChild(box);
    const wrap = box.querySelector('#blStages');
    const update = () => {
      const boxes = [...wrap.querySelectorAll('input[type=checkbox]')];
      const done = boxes.filter(b => b.checked).length;
      const pct = boxes.length ? Math.round(done / boxes.length * 100) : 0;
      box.querySelector('#blBar').style.width = pct + '%';
      box.querySelector('#blPct').textContent = `${I18n.t('compliance')}: ${pct}%`;
    };
    stages.forEach(stage => {
      const blk = this.el(`<div class="stage-block"><h4>${stage.name}</h4></div>`);
      stage.items.forEach(item => {
        const row = this.el(`<label class="check-item"><input type="checkbox" /> <span>${item}</span></label>`);
        row.querySelector('input').onchange = update;
        blk.appendChild(row);
      });
      wrap.appendChild(blk);
    });
    update();
  },

  /* ============ 9. Contract drafting & clause analysis ============ */
  CONTRACT_CLAUSES: [
    { ar: 'تمهيد وديباجة', en: 'Preamble' },
    { ar: 'الأطراف وصفاتهم القانونية وأهليتهم', en: 'Parties & legal capacity' },
    { ar: 'موضوع العقد ونطاقه', en: 'Subject & scope' },
    { ar: 'المدة والجدول الزمني', en: 'Term & timeline' },
    { ar: 'الثمن والبدلات وطريقة السداد', en: 'Price, fees & payment' },
    { ar: 'الضمانات والكفالات', en: 'Guarantees & bonds' },
    { ar: 'الالتزامات والواجبات المتبادلة', en: 'Mutual obligations' },
    { ar: 'الملكية الفكرية والسرية', en: 'IP & confidentiality' },
    { ar: 'التعويضات وتحديد المسؤولية', en: 'Indemnity & liability cap' },
    { ar: 'القوة القاهرة والظروف الطارئة', en: 'Force majeure' },
    { ar: 'الإنهاء وآثاره', en: 'Termination & effects' },
    { ar: 'تسوية النزاعات والتحكيم', en: 'Dispute resolution & arbitration' },
    { ar: 'القانون الواجب التطبيق والاختصاص', en: 'Governing law & jurisdiction' },
    { ar: 'التوقيعات والشروط النهائية', en: 'Signatures & final provisions' }
  ],
  RISKY_PATTERNS: ['مطلق', 'غير محدد', 'دون تحديد', 'حصرياً', 'إلى ما تراه', 'بما تراه مناسباً', 'بلا حدود', 'irrevocable', 'unlimited', 'sole discretion'],

  render_contract(panel) {
    const box = this.el(`
      <div>
        <h2>📝 ${I18n.t('toolContract')}</h2>
        <div class="form-grid">
          <label>${I18n.t('contractType')}
            <select id="ctType">
              <option>توريد دولي</option><option>وكالة وتوزيع</option><option>مشروع مشترك</option>
              <option>ترخيص تقني</option><option>خدمات استشارية</option><option>عقد عمل</option><option>عقد إيجار</option>
            </select>
          </label>
          <label>${I18n.t('contractParties')}
            <input id="ctParties" type="text" />
          </label>
          <label>${I18n.t('contractLaw')}
            <select id="ctLaw">
              <option>الأنظمة السعودية</option><option>الأنظمة الإماراتية</option><option>الأنظمة العمانية</option>
              <option>القانون الإنجليزي</option><option>CISG (اتفاقية البيع الدولي)</option>
            </select>
          </label>
        </div>
        <button id="ctGen" class="primary">▶ ${I18n.t('contractGen')}</button>
        <hr style="margin:18px 0;border-color:var(--border)" />
        <label style="display:block;margin-bottom:8px">${I18n.t('contractAnalyze')}
          <textarea id="ctText" rows="6" placeholder="${I18n.t('contractPaste')}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;outline:none"></textarea>
        </label>
        <button id="ctCheck" class="primary">⌕ ${I18n.t('contractCheck')}</button>
        <div id="ctOut"></div>
      </div>`);
    panel.appendChild(box);

    box.querySelector('#ctGen').onclick = () => {
      const out = box.querySelector('#ctOut');
      const type = box.querySelector('#ctType').value;
      const parties = box.querySelector('#ctParties').value.trim() || '—';
      const law = box.querySelector('#ctLaw').value;
      const kbRes = Retrieval.extractiveAnswer(type + ' عقد ' + parties, { topK: 6 });
      const lines = [];
      lines.push('# عقد ' + type);
      lines.push('');
      lines.push('> [!WARNING] مسودة أولية');
      lines.push('> ' + I18n.t('agentDisclaimer'));
      lines.push('');
      lines.push('## ' + I18n.t('contractChecklist'));
      lines.push('');
      const alpha = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص'];
      this.CONTRACT_CLAUSES.forEach((c, i) => {
        lines.push(`${alpha[i] || i + 1}. **${c.ar}** — يُستوفى وفق اتفاق الطرفين ووفق ${law}.`);
      });
      lines.push('');
      lines.push('## الأساس النظامي من قاعدة المعرفة');
      lines.push('');
      (kbRes.passages || []).slice(0, 4).forEach(p => {
        lines.push(`**${p.docTitle}${p.articleNum ? ' (' + p.articleNum + ')' : ''}**`);
        lines.push('> ' + p.text);
        lines.push('');
      });
      lines.push('---');
      lines.push('*' + I18n.t('chatCitations') + ': ' + ((kbRes.citations || []).map(c => c.docTitle).join(' · ') || '—') + '*');
      out.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'result-card';
      card.appendChild(renderMarkdown(lines.join('\n')));
      const copy = document.createElement('button');
      copy.className = 'primary';
      copy.textContent = '📋 ' + I18n.t('copy');
      copy.onclick = () => navigator.clipboard.writeText(lines.join('\n')).then(() => App.toast(I18n.t('copied')));
      card.appendChild(copy);
      out.appendChild(card);
    };

    box.querySelector('#ctCheck').onclick = () => {
      const out = box.querySelector('#ctOut');
      const text = box.querySelector('#ctText').value.trim();
      out.innerHTML = '';
      if (!text) { out.innerHTML = '<p class="hint">—</p>'; return; }
      const lines = [];
      lines.push('# ' + I18n.t('contractAnalyze'));
      lines.push('');
      const missing = this.CONTRACT_CLAUSES.filter(c => {
        const key = c.ar.split(' ')[0];
        return !text.includes(key);
      });
      lines.push('## ' + I18n.t('contractMissing'));
      lines.push('');
      if (missing.length) missing.forEach(c => lines.push('- ❌ ' + c.ar));
      else lines.push('- ✓ ' + I18n.t('contractClean'));
      lines.push('');
      const lower = text.toLowerCase();
      const risky = this.RISKY_PATTERNS.filter(p => lower.includes(p.toLowerCase()));
      lines.push('## ' + I18n.t('contractRisky'));
      lines.push('');
      if (risky.length) risky.forEach(p => lines.push('- ⚠️ ' + p));
      else lines.push('- ✓ —');
      lines.push('');
      const kbRes = Retrieval.extractiveAnswer(text.slice(0, 300), { topK: 5 });
      if ((kbRes.passages || []).length) {
        lines.push('## ' + I18n.t('officialSources'));
        lines.push('');
        kbRes.passages.slice(0, 3).forEach(p => {
          lines.push(`**${p.docTitle}${p.articleNum ? ' (' + p.articleNum + ')' : ''}**`);
          lines.push('> ' + p.text);
          lines.push('');
        });
      }
      lines.push('---');
      lines.push('> [!NOTE] ' + I18n.t('agentDisclaimer'));
      const card = document.createElement('div');
      card.className = 'result-card';
      card.appendChild(renderMarkdown(lines.join('\n')));
      out.appendChild(card);
    };
  },

  /* ============ 10. Social media topic monitoring ============ */
  SOCIAL_PLATFORMS: [
    { id: 'x', icon: '𝕏', key: 'platformX' },
    { id: 'facebook', icon: '📘', key: 'platformFacebook' },
    { id: 'instagram', icon: '📸', key: 'platformInstagram' },
    { id: 'tiktok', icon: '🎵', key: 'platformTikTok' },
    { id: 'linkedin', icon: '💼', key: 'platformLinkedIn' },
    { id: 'snapchat', icon: '👻', key: 'platformSnapchat' },
    { id: 'youtube', icon: '▶️', key: 'platformYouTube' },
    { id: 'other', icon: '🌐', key: 'platformOther' }
  ],

  render_socialMonitor(panel) {
    const box = this.el(`
      <div>
        <h2>📡 ${I18n.t('toolSocial')}</h2>
        <p class="hint">${I18n.t('socialDesc')}</p>
        <label style="display:block;margin-bottom:10px">${I18n.t('socialTopic')}
          <textarea id="smTopic" rows="2" placeholder="${I18n.t('socialTopicPh')}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;outline:none"></textarea>
        </label>
        <div style="margin-bottom:10px">
          <div class="side-section-title" style="margin:0 0 6px">${I18n.t('socialPlatforms')}</div>
          <div id="smPlatforms" style="display:flex;flex-wrap:wrap;gap:8px"></div>
        </div>
        <button id="smRun" class="primary">▶ ${I18n.t('socialRun')}</button>
        <div id="smOut" style="margin-top:14px"></div>
      </div>`);
    panel.appendChild(box);

    const plWrap = box.querySelector('#smPlatforms');
    this.SOCIAL_PLATFORMS.forEach((p, i) => {
      const label = document.createElement('label');
      label.className = 'check-item';
      label.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:6px 10px';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = i < 5;
      cb.dataset.pl = p.id;
      const span = document.createElement('span');
      span.textContent = `${p.icon} ${I18n.t(p.key)}`;
      label.appendChild(cb);
      label.appendChild(span);
      plWrap.appendChild(label);
    });

    box.querySelector('#smRun').onclick = async () => {
      const out = box.querySelector('#smOut');
      const topic = box.querySelector('#smTopic').value.trim();
      out.innerHTML = '';
      if (!topic) { out.innerHTML = `<p class="hint">—</p>`; return; }
      out.innerHTML = `<div class="hint">${I18n.t('loading')}</div>`;

      const platforms = [...plWrap.querySelectorAll('input:checked')].map(c => c.dataset.pl);
      const lines = [];
      lines.push(`# ${I18n.t('socialReport')} — ${topic}`);
      lines.push('');

      const connectors = ((window.daaixSettings || {}).connectors || []).filter(c => c.enabled !== false && c.url);
      const posts = [];
      for (const c of connectors) {
        try {
          const res = await window.daaix.netPost(c.url, c.apiKey || '', {
            mode: 'social-monitor', query: topic, platforms, lang: I18n.lang
          });
          if (res && Array.isArray(res.posts)) posts.push(...res.posts.map(x => ({ ...x, source: c.name || c.url })));
        } catch (e) { /* connector offline: skip */ }
      }

      if (posts.length) {
        lines.push(`## ${I18n.t('socialPosts')} (${posts.length})`);
        lines.push('');
        posts.slice(0, 20).forEach(p => {
          const pl = (this.SOCIAL_PLATFORMS.find(x => x.id === p.platform) || {}).icon || '🌐';
          lines.push(`- ${pl} **${p.author || '—'}** (${p.platform || '—'}) — ${I18n.t('socialEngagement')}: ${p.engagement != null ? p.engagement : '—'} · ${I18n.t('socialReplies')}: ${p.replies != null ? p.replies : '—'}`);
          if (p.text) lines.push(`  > ${String(p.text).slice(0, 220)}`);
          if (p.url) lines.push(`  [${I18n.t('sourceLink')}](${p.url})`);
        });
        lines.push('');
        const byPlat = {};
        posts.forEach(p => {
          const k = p.platform || '—';
          byPlat[k] = (byPlat[k] || 0) + (Number(p.engagement) || 0);
        });
        const top = Object.entries(byPlat).sort((a, b) => b[1] - a[1])[0];
        if (top) {
          lines.push(`## ${I18n.t('socialAnalysis')}`);
          lines.push('');
          lines.push(`- ${I18n.t('socialTopPlatform')}: **${top[0]}** (${top[1]})`);
          lines.push(`- ${I18n.t('socialTotalEngagement')}: ${Object.values(byPlat).reduce((a, b) => a + b, 0)}`);
          lines.push('');
        }
      } else {
        lines.push('> [!WARNING] ' + I18n.t('socialNeedConnector'));
        lines.push('');
        lines.push(`## ${I18n.t('socialAnalysis')}`);
        lines.push('');
        lines.push(`- ${I18n.t('socialMetric1')}`);
        lines.push(`- ${I18n.t('socialMetric2')}`);
        lines.push(`- ${I18n.t('socialMetric3')}`);
        lines.push('');
      }

      const kbRes = Retrieval.extractiveAnswer(topic, { topK: 5 });
      if ((kbRes.passages || []).length) {
        lines.push(`## ${I18n.t('socialContext')}`);
        lines.push('');
        kbRes.passages.slice(0, 3).forEach(p => {
          lines.push(`**${p.docTitle}${p.articleNum ? ' (' + p.articleNum + ')' : ''}**`);
          lines.push(`> ${p.text}`);
          lines.push('');
        });
        lines.push(`${I18n.t('chatCitations')}: ${(kbRes.citations || []).map((c, i) => `[${i + 1}] ${c.docTitle}`).join(' · ')}`);
        lines.push('');
      }
      lines.push('---');
      lines.push(`*${I18n.t('agentDisclaimer')}*`);

      out.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'result-card';
      card.appendChild(renderMarkdown(lines.join('\n')));
      out.appendChild(card);
    };
  },

  /* ============ 11. WhatsApp knowledge-base auto-responder ============ */
  render_whatsapp(panel) {
    const kbOptions = KB.kbs.map(kb =>
      `<option value="${kb.id}">${kb.icon || '📚'} ${kb.name[I18n.lang] || kb.name.ar}</option>`
    ).join('');
    const box = this.el(`
      <div>
        <h2>💬 ${I18n.t('toolWhatsapp')}</h2>
        <p class="hint">${I18n.t('waDesc')}</p>
        <div class="form-grid">
          <label>${I18n.t('waKb')}
            <select id="waKb">${kbOptions}</select>
          </label>
          <label>${I18n.t('waApiUrl')}
            <input id="waUrl" type="url" placeholder="https://messages.example.com/webhook" />
          </label>
          <label>${I18n.t('waApiKey')}
            <input id="waKey" type="password" autocomplete="off" />
          </label>
        </div>
        <div style="margin:14px 0 6px" class="side-section-title">${I18n.t('waQa')}</div>
        <div id="waPairs"></div>
        <div style="display:flex;gap:8px;margin:10px 0">
          <button id="waAddPair" class="primary">➕ ${I18n.t('waAddPair')}</button>
          <button id="waSave" class="primary">💾 ${I18n.t('waSave')}</button>
        </div>
        <hr style="margin:18px 0;border-color:var(--border)" />
        <div class="side-section-title" style="margin:0 0 6px">${I18n.t('waTest')}</div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="waTestQuery" type="text" placeholder="${I18n.t('waTestPh')}" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;outline:none" />
          <button id="waTestBtn" class="primary">➤</button>
        </div>
        <div id="waTestOut"></div>
      </div>`);
    panel.appendChild(box);

    const KEY = 'daaix-whatsapp';
    const cfg = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (cfg.kbId) box.querySelector('#waKb').value = cfg.kbId;
    if (cfg.url) box.querySelector('#waUrl').value = cfg.url;
    if (cfg.apiKey) box.querySelector('#waKey').value = cfg.apiKey;

    const pairsWrap = box.querySelector('#waPairs');
    const addPair = (q, a) => {
      const row = document.createElement('div');
      row.className = 'wa-pair';
      row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 34px;gap:6px;margin-bottom:6px';
      row.innerHTML = `
        <input type="text" placeholder="${I18n.t('waQ')}" value="${esc(q || '')}" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px;outline:none" />
        <textarea rows="1" placeholder="${I18n.t('waA')}" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px;outline:none">${esc(a || '')}</textarea>
        <button class="danger">✕</button>`;
      row.querySelector('button').onclick = () => row.remove();
      pairsWrap.appendChild(row);
    };
    (cfg.pairs || []).forEach(pr => addPair(pr.q, pr.a));
    box.querySelector('#waAddPair').onclick = () => addPair('', '');

    box.querySelector('#waSave').onclick = () => {
      const pairs = [...pairsWrap.querySelectorAll('.wa-pair')].map(row => ({
        q: row.querySelector('input').value.trim(),
        a: row.querySelector('textarea').value.trim()
      })).filter(pr => pr.q && pr.a);
      const data = {
        kbId: box.querySelector('#waKb').value,
        url: box.querySelector('#waUrl').value.trim(),
        apiKey: box.querySelector('#waKey').value.trim(),
        pairs
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      App.toast('✓ ' + I18n.t('waSaved'));
    };

    const answerFor = (query) => {
      const cfgNow = JSON.parse(localStorage.getItem(KEY) || '{}');
      const norm = (x) => String(x || '').toLowerCase().replace(/[\u064B-\u065F\u0640]/g, '').replace(/\s+/g, ' ').trim();
      const qn = norm(query);
      const uiPairs = [...pairsWrap.querySelectorAll('.wa-pair')].map(row => ({
        q: row.querySelector('input').value.trim(),
        a: row.querySelector('textarea').value.trim()
      })).filter(pr => pr.q && pr.a);
      const allPairs = [...uiPairs, ...((cfgNow.pairs || []))];
      const pair = allPairs.find(pr => qn && (norm(pr.q) === qn || norm(pr.q).includes(qn) || qn.includes(norm(pr.q))));
      if (pair) return { reply: pair.a, source: 'injected' };

      const kbId = cfgNow.kbId || (box.querySelector('#waKb') || {}).value;
      const ids = new Set(KB.index.filter(e => e.kbId === kbId).map(e => e.doc.id));
      const kbRes = Retrieval.extractiveAnswer(query, {
        scopeDocIds: ids.size ? ids : new Set(['__none__']),
        topK: 6
      });
      if ((kbRes.passages || []).length) {
        return { reply: kbRes.answer, source: 'kb', citations: kbRes.citations };
      }
      return { reply: I18n.t('waNoMatch'), source: 'none' };
    };

    box.querySelector('#waTestBtn').onclick = async () => {
      const out = box.querySelector('#waTestOut');
      const query = box.querySelector('#waTestQuery').value.trim();
      out.innerHTML = '';
      if (!query) { out.innerHTML = '<p class="hint">—</p>'; return; }
      const r = answerFor(query);
      const lines = [];
      lines.push(`**${I18n.t('waReply')}:**`);
      lines.push('');
      if (r.source === 'kb') lines.push(r.reply);
      else lines.push(`> ${r.reply}`);
      lines.push('');
      lines.push(`— ${r.source === 'injected' ? I18n.t('waFromInjected') : r.source === 'kb' ? I18n.t('ctxKb') : I18n.t('waNoMatch')}`);
      if (r.citations && r.citations.length) {
        lines.push(`${I18n.t('chatCitations')}: ${r.citations.map((c, i) => `[${i + 1}] ${c.docTitle}${c.articleNum ? ' (' + c.articleNum + ')' : ''}`).join(' · ')}`);
      }
      const card = document.createElement('div');
      card.className = 'result-card';
      card.appendChild(renderMarkdown(lines.join('\n')));

      const url = box.querySelector('#waUrl').value.trim();
      const key = box.querySelector('#waKey').value.trim();
      if (url) {
        const sendBtn = document.createElement('button');
        sendBtn.className = 'primary';
        sendBtn.textContent = '📤 ' + I18n.t('waSend');
        sendBtn.onclick = async () => {
          try {
            await window.daaix.netPost(url, key, { mode: 'whatsapp-reply', from: query, reply: r.reply });
            App.toast('✓ ' + I18n.t('waSent'));
          } catch (e) {
            App.toast('⚠ ' + I18n.t('waSendFailed'));
          }
        };
        card.appendChild(sendBtn);
      }
      out.appendChild(card);
    };
  },

  /* ============ 11. OCR — سحب صور الوثائق (AI vision engine) ============ */
  /* v1.6.30: document image scanner powered by the AI agents layer (vision LLM via the configured endpoint). */
  render_ocr(panel) {
    const box = this.el(`
      <div>
        <h2>📷 ${I18n.t('toolOcr')}</h2>
        <p class="hint">${I18n.t('descOcr')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0">
          <button class="primary" id="ocrPick">📁 ${I18n.t('ocrPick')}</button>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)">${I18n.t('ocrModel')}
            <input id="ocrModel" placeholder="gpt-4o / gemini / qwen-vl…" style="width:230px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 10px;outline:none" />
          </label>
        </div>
        <div id="ocrStatus" class="hint" style="margin-bottom:10px"></div>
        <div id="ocrOut"></div>
      </div>`);
    panel.appendChild(box);

    const modelInput = box.querySelector('#ocrModel');
    modelInput.value = (window.daaixSettings || {}).ocrModel || '';
    modelInput.onchange = async (e) => {
      const v = e.target.value.trim();
      if (window.daaixSettings) window.daaixSettings.ocrModel = v;
      await window.daaix.settingsSet({ ocrModel: v });
    };

    box.querySelector('#ocrPick').onclick = async () => {
      const status = box.querySelector('#ocrStatus');
      const out = box.querySelector('#ocrOut');
      const file = await window.daaix.pickFile(I18n.t('ocrPick'), ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'pdf']);
      if (!file) return;
      const llm = (window.daaixSettings || {}).llm || {};
      if (!llm.baseUrl || !/^(https?:)?\/\//.test(llm.baseUrl)) {
        status.textContent = I18n.t('ocrNeedLlm');
        return;
      }
      status.textContent = I18n.t('ocrWorking');
      const isPdf = /\.pdf$/i.test(file.name);
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' }[ext] || (isPdf ? 'application/pdf' : 'image/png');
      const dataUrl = `data:${mime};base64,${file.data}`;
      const model = modelInput.value.trim() || llm.model || 'gpt-4o-mini';
      const lang = I18n.lang;
      const prompt = [
        lang === 'ar'
          ? 'You are the OCR engine of DaAIx ("سحب صور الوثائق") working as an AI vision agent.'
          : 'You are the OCR engine of DaAIx ("Document Image Scanner") working as an AI vision agent.',
        'Extract EVERY piece of text visible in the attached image or document — Arabic, English, or any other language — exactly as written.',
        'STRICT RULES:',
        '1) Return ONLY the extracted text as clean Markdown — no commentary, no preamble, no translations.',
        '2) Preserve the original wording verbatim: never translate, correct, summarise or rephrase.',
        '3) Preserve structure: headings (#), numbered lists, tables, article numbers, dates, amounts and signatures exactly as shown.',
        '4) Read both printed and handwritten text.',
        '5) If part of the image is unreadable, write [unreadable] in its place.',
        lang === 'ar' ? 'أخرج النص بنفس لغته الأصلية مع الإخراج بصيغة Markdown.' : 'Output the text in its original language.'
      ].join('\n');
      const sendVision = (url) => fetch(llm.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (llm.apiKey || '') },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url } }
          ]}]
        })
      }).then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const textOut = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!textOut) throw new Error('empty');
        return textOut;
      });

      let text = null;
      try {
        text = await sendVision(dataUrl);
      } catch (visionErr) {
        if (isPdf) {
          /* scanned-PDF fallback: embedded text layer via the converter engine */
          const conv = await window.daaix.convertToMarkdown({ path: file.path, data: file.data });
          const md = conv.ok ? String(conv.markdown || '') : '';
          if (md.replace(/\s/g, '').length >= 40) {
            text = md;
          } else {
            status.textContent = I18n.t('ocrScannedPdfHint');
            return;
          }
        } else {
          status.textContent = I18n.t('ocrFail') + ' — ' + String(visionErr && visionErr.message || visionErr);
          return;
        }
      }
      status.textContent = I18n.t('ocrDone') + ' — ' + file.name;

      const card = this.el(`<div class="result-card"></div>`);
      const head = this.el(`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-weight:700">${(typeof esc === 'function') ? esc(file.name) : file.name}</span>
        <span class="hint" style="flex:1">${text.length.toLocaleString()} ${I18n.t('charsCount')}</span>
      </div>`);
      card.appendChild(head);
      const actions = this.el(`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px"></div>`);
      const mk = (label, fn) => {
        const b = this.el(`<button class="ghost-btn">${label}</button>`);
        b.onclick = fn;
        return b;
      };
      actions.appendChild(mk(I18n.t('ocrCopy'), () => { if (navigator.clipboard) navigator.clipboard.writeText(text); App.toast(I18n.t('ocrCopied')); }));
      actions.appendChild(mk(I18n.t('ocrSaveNote'), () => {
        const id = 'note-' + Date.now();
        const tm = text.match(/^#\s+(.+)$/m);
        const title = (tm ? tm[1] : file.name).trim().slice(0, 60);
        window.daaix.notesSave({ id, markdown: '# ' + title + '\n\n' + text }).then(() => {
          App.toast(I18n.t('ocrSaved'));
          Notes.refresh();
        });
      }));
      actions.appendChild(mk(I18n.t('ocrToAgent'), () => {
        const input = document.getElementById('agentInput');
        if (input) { input.value = text.slice(0, 4000); input.focus(); }
        App.activateTab('agents');
      }));
      card.appendChild(actions);
      const preview = this.el(`<div class="md-preview"></div>`);
      preview.appendChild(renderMarkdown(text));
      card.appendChild(preview);
      out.appendChild(card);
    };
  }
};
