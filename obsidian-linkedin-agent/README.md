# obsidian-linkedin-agent

أداة drafting (صياغة) لـ LinkedIn مربوطة بـ **Obsidian**: تقرأ أفكارك من الـ vault،
 Horizonte typen'ils في `LinkedIn Agent/queue/` داخل الـ vault نفسه،
 كل مسودة تمر عبر **humanizer** (ينظّف Authorship الـ AI) و**5 فحوصات كشف** قبل أن تراها،
 ولا شيء يُنشر تلقائياً — أنت من ينسخ Wil ي贴. هذا التصميم مقصود، لا قيوداً: لا يوجد
 API رسمي للنشر على بروفايل شخصي، والأتمتة عبر المتصفح تخالف [اتفاقية LinkedIn](https://www.linkedin.com/legal/user-agreement)
 وتعرّض الحساب للحظر.

 Arabic | English below

## التثبيت

```bash
git clone <this-repo>
cd obsidian-linkedin-agent
pip install -e .          # أو: PYTHONPATH=. python3 -m liagent.cli ...
```

لا يحتاج أي حزم خارجية — Python 3.11+ فقط.

## البدء السريع

```bash
liagent init --vault ~/Obsidian/MyVault   # ينشئ مجلد "LinkedIn Agent" داخل الـ vault
# عدّل voice.md (صوتك) و specialists.md (المتخصصون حسب المجال)

liagent ideas --vault ~/Obsidian/MyVault                      # Affiche أفكارك (ملاحظة بـ #linkedin/idea أو داخل Ideas/)
liagent post --vault V --note "Ideas/deal.md" --hooks 1,5,9     # مسودة بوست من ملاحظة
liagent post --vault V --idea "فكرة خام"                       # أو من فكرة مباشرة
liagent comment --vault V --field "machine learning" --post "نص منشور زميل" --type 5
liagent dm --vault V --message "نص الرسالةklama"               # مسودة رد على رسالة
liagent profile --vault V --section skills --item PyTorch --item "LLM eval"
liagent profile --vault V --section certifications --item "AWS SA"
liagent profile --vault V --section courses --item "DeepLearning.AI"

liagent queue --vault V                    # قائمة الانتظار (pending)
liagent approve <id> --vault V             # moves to approved/
liagent reject  <id> --vault V
liagent export  <id> --vault V             # bloques جاهز للنسخ — Nothing is posted
liagent score file.txt                     # لوحة الفحوصات الخمسة
liagent humanize file.txt --report         # تنظيف بصمة "الآلة"
```

## ما يفعله بالضبط

| الأمر | الوصف |
|---|---|
| `init` | ينشئ `LinkedIn Agent/` في الـ vault: `queue/{pending,approved,rejected}`, `voice.md`, `specialists.md` |
| `ideas` | يقرأ ملاحظات الـ vault (frontmatter + tags) ويستخرجIdeas tagged `#linkedin/idea` |
| `post` | يبني بوست من 21 hook formula (`liagent/data/hooks.json`) + نقاط الملاحظة |
| `comment` | 9 أنواع تعليقات، وينتهي باقتراح متابعة متخصصين في المجال من `specialists.md` |
| `dm` | رد مختصر (≤200 حرف) على رسالة واردة |
| `profile` | مسودات لأقسام البروفايل: headline / about / skills / experience / certifications / courses، مع checklists من rubric من 100 نقطة |
| `queue`/`approve`/`reject`/`export` | workflow الموافقة: pending → approved/rejected، Все как ملفات markdown داخل Obsidian |
| `score`/`humanize` | humanize.py + detect.py من المشروع الأصلي: removes invisible chars, em dashes, slop lexicon (113 مصطلح) ثم يقيس BURSTINESS / SPECIFICITY / SLOP DENSITY / FINGERPRINT / VOICE |

كل مسودة تُخزَّن مع `human_score` و`verdict` (PASS/REVIEW/FLAGGED) في frontmatter الخاص بها،
 حتى ترى всегда Качество قبل الموافقة.

## لماذا لا يوجد نشر أوتوماتيكي

LinkedIn لا يوفّر API للنشر على حساب شخصي بدون تطبيق شريك معتمد، واستخدام المتصفح
 أو أدوات طرف ثالث (Playwright, unofficial APIs) يخالف User Agreement ويعرّض الحساب
 للتقييد. لهذا الأداة تنتج **copy-ready blocks** فقط. إذا كانت لديك صفحة شركة (Company Page)،
 można استخدام LinkedIn Marketing API الرسمي مع صلاحيات sinkriv.

## البنية

```
liagent/
  vault.py     قراءة الـ vault (markdown + frontmatter + tags)
  drafts.py    مولدات: post / comment / dm / profile
  queue.py     Approval queue كملفات داخل الـ vault
  humanize.py  تنظيف بصمة النص (مشتق من upstream)
  detect.py    لوحة الفحوصات الخمسة (مشتق من upstream)
  data/        slop.json, hooks.json, rubric.json (مشتقة من upstream)
  cli.py       واجهة الأوامر
tests/         14 اختباراً (python3 -m unittest discover -s tests)
```

## Esprit / esquina

الملفات `liagent/data/*` و`humanize.py` و`detect.py` و`templates/voice.md` مشتقة من
 [linkedin-agent-skill](https://github.com/Jakeschincariol/linkedin-agent-skill) (MIT) — see [NOTICE.md](NOTICE.md).

## English

An offline, stdlib-only CLI that turns an Obsidian vault into a LinkedIn **drafting**
pipeline with a human approval gate. It generates posts (21 hook formulas), comments
with follow-specialists suggestions per field, DM replies, and profile sections
(skills, certifications, courses, headline, about scored against a 100-point rubric).
Every draft is humanized and scored with a five-check local detector before it enters
`LinkedIn Agent/queue/pending/` inside your vault. Nothing is ever posted
automatically — approval only moves a markdown file; you paste the content yourself,
because LinkedIn has no official personal-posting API and browser automation violates
its User Agreement.

## License

MIT
