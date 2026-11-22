'use strict';

/* v1.6.34: DaAIx canonical document formatting engine.
   Implements the approved legal-file formatting spec so the app both
   recognizes it and normalizes imported documents to it:
   - numbered paragraphs:        "1  . text" / compound "1/1  . text"
     (number, TWO spaces, dot, ONE space, text)
   - forbidden forms corrected:  "1. t", "1 . t", "1 - t", "1- t",
     leading dash bullets ("- t" -> "t"), hidden chars / double dashes
     before the number
   - glued sub-numbers pushed to their own line ("3/65 . 1- t" ->
     "3/65  ." then "1  . t"); digit sub -> numbered form,
     letter sub (أ، ب، ج …) -> literal form
   - literal (lettered) paragraphs: TAB + "* " + letter + two spaces + ". "
   - preamble items: never # headings -> "**أولًا:**" bold + colon directly
   - definition names bold with colon ("النظام: x" -> "**النظام:** x"),
     also inside numbered / literal paragraphs
   Deterministic, line-based and idempotent; fenced code blocks and
   markdown tables untouched. */

const DocFormat = (() => {
  const HIDDEN = '\u200B\u200C\u200D\u200E\u200F\u061C\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\uFEFF';
  const DASHC = '-\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63';
  /* literal letters exactly as the spec lists them (أ ب ج د هـ و ز ح ط ك ل م ن س ع ف ق ر ش ت ظ) */
  const LIT_LETTERS = '\u0623\u0628\u062C\u062F\u0647\u0648\u0632\u062D\u0637\u0643\u0644\u0645\u0646\u0633\u0639\u0641\u0642\u0631\u0634\u062A\u0638';
  /* preamble ordinal words: stem + alef + optional fathatan either side (first & second */
  const PRE = [
    '\u0623\u0648\u0644\u0627', '\u062B\u0627\u0646\u064A\u0627', '\u062B\u0627\u0644\u062B\u0627', '\u0631\u0627\u0628\u0639\u0627',
    '\u062E\u0627\u0645\u0633\u0627', '\u0633\u0627\u062F\u0633\u0627', '\u0633\u0627\u0628\u0639\u0627', '\u062B\u0627\u0645\u0646\u0627',
    '\u062A\u0627\u0633\u0639\u0627', '\u0639\u0627\u0634\u0631\u0627'
  ].map(w => w.slice(0, -1) + '(?:\u064B)?\u0627(?:\u064B)?').join('|');

  const clsDash = '[' + DASHC.replace('-', '\\-') + ']';
  const clsHidden = '[' + HIDDEN + ']';
  const NUM = '\\d{1,4}(?:\\s*\\/\\s*\\d{1,4})?';

  const reNum = new RegExp('^' + clsHidden + '*(' + NUM + ')\\s*(?:[.\u066B\\)]|' + clsDash + ')\\s*(.*)$');
  const reNumGlue = new RegExp('^' + clsHidden + '*(' + NUM + ')\\s*[.\u066B]\\s*' + clsDash + '{0,2}\\s*(\\d{1,3}|[' + LIT_LETTERS + '])\\s*\u0640?(?:' + clsDash + '\\s*|\u066B\\s*|\\.\\s*)(.+)$');
  const reNumGlueSep = new RegExp('^' + clsHidden + '*(' + NUM + ')\\s*[.\u066B]\\s*(' + NUM + ')\\s+(\\S.*)$');
  const reNumNoSep = new RegExp('^(' + NUM.replace('\\s*\\/\\s*', '\\/') + ')[ \t]+(\\S.*)$');
  const reLit = new RegExp('^(\t| {1,})?\\*?\\s*' + clsDash + '{0,2}([' + LIT_LETTERS + '])\u0640?\\s*(?:' + clsDash + '\\s*|\u066B\\s*|\\.\\s*)(\\S.*)$');
  const reHashPre = new RegExp('^#{1,6}\\s*(' + PRE + ')\\s*\\#{0,6}\\s*(.*)$');
  const rePreDash = new RegExp('^(' + PRE + ')\\s+' + clsDash + '\\s*(\\S.+)$');
  const rePreLine = new RegExp('^(' + PRE + ')\\s*[:\u061B]?\\s*(.*)$');
  const reDefNum = new RegExp('^(' + NUM.replace('\\s*\\/\\s*', '\\/') + '\\s{2}\\.\\s?)((?:\u0627\u0644)[^\u002a\\n:]{1,30}?)\\s*:\\s+(\\S.+)$');
  const reDefLit = new RegExp('^(\\t\\* [' + LIT_LETTERS + ']\\s{2}\\.)((?:\u0627\u0644)[^\u002a\\n:]{1,30}?)\\s*:\\s+(\\S.+)$');
  const reDefSolo = new RegExp('^((?:\u0627\u0644)[\u0621-\u064A\u0640]{1,24})\\s*:\\s+(\\S.+)$');
  const reHr = /^\s*(?:[-–—]\s*){2,}$/;

  const canon = (num, text) => num.replace(/\s*\/\s*/, '/') + '  .' + (text ? ' ' + text : '');

  function core(body, dashRun) {
    /* dashed-number noise: "‏--1 text" -> numbered paragraph */
    if (dashRun > 0) {
      const m = body.match(reNum);
      if (m) {
        const after = (m[2] || '').trim();
        if (after) return canon(m[1], after);
        return canon(m[1], '');
      }
      const mns = body.match(reNumNoSep);
      if (mns) return canon(mns[1], mns[2].trim());
      if (body.trim()) return body.trim();   /* plain bullet: keep the text alone */
      return '';
    }

    const g2 = body.match(reNumGlueSep);
    if (g2) return canon(g2[1], '') + '\n' + canon(g2[2], g2[3].trim());

    const n = body.match(reNum);
    if (n) {
      const after = (n[2] || '').trim();
      const at = body.indexOf(n[1]) + n[1].length;
      const sep = body.slice(at, body.length - ((n[2] || '').length)).trim();
      /* keep date/range lines like "2015 - 2020 نص" untouched */
      if (clsDash.indexOf(sep.charAt(0)) >= 0 && /^[0-9]/.test(after)) return body;
      return canon(n[1], after);
    }

    const l = body.match(reLit);
    if (l) return '\t\u002a ' + l[2] + '  . ' + l[3].replace(/^\s+/, '');

    const pd = body.match(rePreDash);
    if (pd) return '\u002a\u002a' + pd[1] + ':\u002a\u002a ' + pd[2].trim();
    const pl = body.match(rePreLine);
    if (pl) {
      const rest = (pl[2] || '').replace(new RegExp('[' + DASHC.replace('-', '\\-') + ']+\\s*'), '').trim();
      return '\u002a\u002a' + pl[1] + ':\u002a\u002a' + (rest ? ' ' + rest : '');
    }

    const ds = body.match(reDefSolo);
    if (ds) return '\u002a\u002a' + ds[1] + ':\u002a\u002a ' + ds[2];

    return body;
  }

  function normalizeLine(line) {
    let s = String(line).replace(new RegExp('^' + clsHidden + '+'), '')
      .replace(new RegExp(clsHidden, 'g'), '')
      .replace(/\s+$/, '');
    if (reHr.test(s)) return s;

    /* preamble items must NEVER be # headings */
    const hp = s.match(reHashPre);
    if (hp) {
      const rest = hp[2].replace(/^[\s.:\u061B)]+/, '').trim();
      return '\u002a\u002a' + hp[1] + ':\u002a\u002a' + (rest ? ' ' + rest : '');
    }

    /* glued sub-number on the parent's line -> push to its own line */
    const g = s.match(reNumGlue);
    if (g) {
      const parent = g[1].replace(/\s*\/\s*/, '/') + '  .';
      const sub = g[2];
      const rest = (g[3] || '').trim();
      return /^\d+$/.test(sub)
        ? parent + '\n' + canon(sub, rest)
        : parent + '\n\t\u002a ' + sub + '  . ' + rest;
    }

    /* leading dash run: bullets, hidden-char noise, double dashes */
    let body = s.replace(/^[ \t]+/, '');
    let dashRun = 0;
    const dm = body.match(new RegExp('^(?:' + clsDash + ')+[ \t]*'));
    if (dm) {
      dashRun = 1;
      body = body.slice(dm[0].length);
    }

    const res = core(body, dashRun);

    /* definition names bold inside numbered / lettered paragraphs */
    const dn = res.match(reDefNum);
    if (dn) return dn[1].replace('  .', '  .') + '\u002a\u002a' + dn[2].trim() + ':\u002a\u002a ' + dn[3].trim();
    const dl = res.match(reDefLit);
    if (dl) return dl[1] + '\u002a\u002a' + dl[2].trim() + ':\u002a\u002a ' + dl[3].trim();
    return res;
  }

  function normalize(md) {
    const lines = String(md == null ? '' : md).split(/\r?\n/);
    let fence = false;
    return lines.map((line) => {
      if (/^\s*```/.test(line)) { fence = !fence; return line.replace(/\s+$/, ''); }
      if (fence) return line;
      if (/^\s*\|/.test(line)) return line.replace(/\s+$/, '');
      return normalizeLine(line);
    }).join('\n');
  }

  return { normalize };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { DocFormat };
