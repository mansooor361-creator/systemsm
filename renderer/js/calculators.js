'use strict';

const Calc = {
  /* ---- Labor (Saudi Labor Law arts. 74/76/84) ---- */
  endOfService({ salary, years, months, mode }) {
    const totalYears = (+years || 0) + (+months || 0) / 12;
    if (!salary || totalYears <= 0) return { award: 0, basis: '' };
    const monthly = +salary;
    const first5 = Math.min(totalYears, 5);
    const beyond = Math.max(totalYears - 5, 0);
    const full = first5 * 0.5 * monthly + beyond * 1 * monthly;

    let award = full;
    let basisKey = 'termination';

    if (mode === 'resignation') {
      basisKey = 'resignation';
      if (totalYears >= 10) award = full;
      else if (totalYears >= 5) award = full * (2 / 3);
      else if (totalYears >= 2) award = full / 3;
      else award = 0;
    }

    const ar = mode === 'resignation'
      ? (award === 0 ? 'لا يستحق مكافأة عند الاستقالة قبل سنتين من الخدمة المتصلة (المادة 84 من نظام العمل).'
         : totalYears >= 10 ? 'المكافأة كاملة — استقالة بعد خدمة متصلة تجاوزت 10 سنوات (المادة 74).'
         : totalYears >= 5 ? 'ثلثا المكافأة — استقالة بعد خدمة من 5 إلى 10 سنوات (المادة 84).'
         : 'ثلث المكافأة — استقالة بعد خدمة من سنتين إلى 5 سنوات (المادة 84).')
      : 'نصف مكافأة عن كل سنة من الخمس الأولى ومكافأة سنة كاملة عن كل سنة تالية (المادة 74).';

    return { award: Math.round(award * 100) / 100, basis: ar, basisEn: basisKey };
  },

  notice({ mode, fixedTerm }) {
    if (mode === 'resignation') return fixedTerm ? 30 : 30;
    return fixedTerm ? 30 : 60;
  },

  /* ---- Court costs (estimate per Judicial Fees Law) ---- */
  courtCosts({ claimValue, caseType, appeal, execution }) {
    const value = Math.max(+claimValue || 0, 0);
    let fee = 0, lines = [];
    if (caseType === 'claim') {
      fee = value * 0.05;
      lines.push({ label: { ar: 'رسوم الدعوى (5% من قيمة المطالبة)', en: 'Claim fee (5% of value)' }, amount: fee });
    } else if (caseType === 'execution') {
      fee = value * 0.02;
      lines.push({ label: { ar: 'رسوم التنفيذ (2% من قيمة المطالبة)', en: 'Execution fee (2%)' }, amount: fee });
    } else {
      fee = 1000; // fixed-fee case types (family, criminal private right) minimum
      lines.push({ label: { ar: 'رسوم ثابتة (حد أدنى)', en: 'Fixed fee (minimum)' }, amount: fee });
    }
    if (appeal) {
      const a = fee * 0.5;
      lines.push({ label: { ar: 'رسوم الاستئناف (50% من رسوم الدعوى)', en: 'Appeal fee (50%)' }, amount: a });
      fee += a;
    }
    if (execution && caseType !== 'execution') {
      const e = value * 0.02;
      lines.push({ label: { ar: 'رسوم التنفيذ (2%)', en: 'Execution fee (2%)' }, amount: e });
      fee += e;
    }
    return { total: Math.max(Math.round(fee), caseType === 'claim' || caseType === 'execution' ? 0 : 1000), lines };
  },

  /* ---- Bid evaluation ---- */
  bid({ bidValue, estCost, technical, experience, competitors }) {
    const cost = +estCost || 0;
    const bid = +bidValue || 0;
    const margin = cost > 0 ? ((bid - cost) / cost) * 100 : 0;
    const priceScore = bid > 0 ? Math.max(0, Math.min(100, (cost / bid) * 100)) : 0;
    const score = priceScore * 0.4 + (+technical || 0) * 0.4 + (+experience || 0) * 0.2;
    const comp = Math.max(+competitors || 1, 1);
    const winProbability = Math.max(5, Math.min(95, Math.round(score * (1.6 - Math.min(comp, 8) * 0.08))));
    return {
      margin: Math.round(margin * 10) / 10,
      score: Math.round(score * 10) / 10,
      winProbability,
      verdict: margin < 5 ? 'low_margin' : margin > 30 ? 'high_margin' : 'healthy'
    };
  },

  /* ---- Building requirements checklist ---- */
  buildingStages(lang) {
    const ar = lang === 'ar';
    return [
      {
        id: 'permits',
        name: ar ? 'التراخيص والتصاريح' : 'Permits',
        items: ar
          ? ['رخصة البناء من البلدية', 'موافقة الأمانة على المخططات', 'تصريح الحفر والردم', 'موافقة الجهات الخدمية (كهرباء/مياه)']
          : ['Municipal building permit', 'Approved drawings', 'Excavation permit', 'Utility approvals']
      },
      {
        id: 'design',
        name: ar ? 'التصميم والإشراف' : 'Design & Supervision',
        items: ar
          ? ['مخططات معتمدة من مهندس مرخص', 'دراسة التربة والأساسات', 'الاشتراك في الإشراف الهندسي', 'اعتماد العزل المائي والحراري']
          : ['Licensed engineer drawings', 'Soil study', 'Engineering supervision', 'Waterproofing approval']
      },
      {
        id: 'safety',
        name: ar ? 'السلامة والحماية' : 'Safety',
        items: ar
          ? ['متطلبات الدفاع المدني', 'مخارج الطوارئ والسلالم', 'أنظمة إطفاء الحريق', 'معدات الوقاية للعمال']
          : ['Civil defense requirements', 'Emergency exits', 'Fire suppression', 'Worker PPE']
      },
      {
        id: 'materials',
        name: ar ? 'المواد والتنفيذ' : 'Materials & Execution',
        items: ar
          ? ['شهادات جودة الخرسانة والحديد', 'اختبارات الخرسانة (كسر مكعبات)', 'الالتزام بالمواصفات السعودية', 'سجل الفحص والاستلام']
          : ['Concrete/steel quality certs', 'Cube tests', 'SASO compliance', 'Inspection log']
      }
    ];
  }
};
