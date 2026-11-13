'use strict';

const Tools = {
  active: null,

  list() {
    return [
      { id: 'consultant', icon: '⚖️', label: I18n.t('toolConsultant') },
      { id: 'converter', icon: '🔄', label: I18n.t('toolConverter') },
      { id: 'costs', icon: '🧾', label: I18n.t('toolCosts') },
      { id: 'labor', icon: '👷', label: I18n.t('toolLabor') },
      { id: 'laborConsultant', icon: '🧑‍⚖️', label: I18n.t('toolLaborConsultant') },
      { id: 'competition', icon: '🏆', label: I18n.t('toolCompetition') },
      { id: 'offers', icon: '📊', label: I18n.t('toolOffers') },
      { id: 'building', icon: '🏗️', label: I18n.t('toolBuilding') },
      { id: 'contract', icon: '📝', label: I18n.t('toolContract') }
    ];
  },

  renderMenu() {
    const menu = document.getElementById('toolsMenu');
    menu.innerHTML = '';
    this.list().forEach(t => {
      const chip = document.createElement('div');
      chip.className = 'tool-chip' + (this.active === t.id ? ' active' : '');
      chip.textContent = `${t.icon} ${t.label}`;
      chip.onclick = () => { this.active = t.id; this.renderMenu(); this.render(t.id); };
      menu.appendChild(chip);
    });
  },

  open(id) {
    this.active = id;
    App.showView('tools');
    this.renderMenu();
    this.render(id);
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

  /* ============ 1. Digital Legal Advisor ============ */
  render_consultant(panel) {
    const box = this.el(`
      <div>
        <h2>⚖️ ${I18n.t('toolConsultant')}</h2>
        <div class="form-grid" style="grid-template-columns:1fr">
          <label>${I18n.t('consultantQuestion')}
            <textarea id="tcQ" rows="3" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;outline:none"></textarea>
          </label>
        </div>
        <button class="primary" id="tcAsk">${I18n.t('calculate')}</button>
        <div id="tcOut"></div>
      </div>`);
    panel.appendChild(box);
    box.querySelector('#tcAsk').onclick = async () => {
      const q = box.querySelector('#tcQ').value.trim();
      if (!q) return;
      const out = box.querySelector('#tcOut');
      out.innerHTML = `<div class="result-card">${I18n.t('loading')}</div>`;
      const res = await Chat.answer(q, { scope: 'all' });
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

  /* ============ 2. Markdown Converter ============ */
  async render_converter(panel) {
    const box = this.el(`
      <div>
        <h2>🔄 ${I18n.t('toolConverter')}</h2>
        <p class="hint" style="margin-bottom:14px">${I18n.t('pickFile')}</p>
        <button class="primary" id="cvPick">📂 ${I18n.t('pickFile')}</button>
        <div class="result-card" style="margin-top:18px">
          <h3 style="margin-bottom:10px">📦 ${I18n.t('bulkConvert')}</h3>
          <label class="check-item"><input type="checkbox" id="cvUpload" /> <span>${I18n.t('uploadToServer')}</span></label>
          <p class="hint" style="margin:6px 0 12px">${I18n.t('connectorHint')}</p>
          <button class="primary" id="cvFolder">📁 ${I18n.t('bulkConvert')}</button>
        </div>
        <div id="cvOut"></div>
      </div>`);
    panel.appendChild(box);
    box.querySelector('#cvFolder').onclick = async () => {
      const upload = box.querySelector('#cvUpload').checked;
      const connector = ((window.daaixSettings || {}).connectors || []).find(c => c.enabled !== false && c.url);
      if (upload && !connector) { App.toast(I18n.t('addConnector')); return; }
      const out = box.querySelector('#cvOut');
      out.innerHTML = `<div class="result-card">${I18n.t('loading')}</div>`;
      const res = await window.daaix.convertFolder(upload && connector ? { uploadUrl: connector.url, uploadKey: connector.apiKey || '' } : {});
      out.innerHTML = '';
      if (!res || !res.ok) { out.innerHTML = `<div class="result-card" style="color:var(--danger)">${(res && res.error) || '—'}</div>`; return; }
      const card = this.el(`<div class="result-card">
        <div class="big">✅ ${I18n.t('convertedCount')}: ${res.converted} ${I18n.t('files')}</div>
        ${res.uploaded ? `<div class="result-line"><span>${I18n.t('uploadToServer')}</span><span>${res.uploaded}</span></div>` : ''}
        ${res.failed && res.failed.length ? `<div class="result-note" style="color:var(--danger)">${I18n.t('failed')}: ${res.failed.map(f => esc(f.file) + ' — ' + esc(f.error)).join(' · ')}</div>` : ''}
      </div>`);
      out.appendChild(card);
    };
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
        <button id="ctCheck" class="primary">🔍 ${I18n.t('contractCheck')}</button>
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
  }
};
