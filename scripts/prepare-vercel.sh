#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  ECHO — prepare-vercel.sh
#  أمر واحد يعمل كل حاجة: ينضف مخلفات البناء، يتأكد إن ملفات الريبو مرتبة،
#  يفحص الأسرار والـ gitignore، يجهز إعدادات فيررشيل، ويعمل بيلد تجريبي
#  مطابق تمامًا للي هيحصل على فيررشيل.
#
#  الاستخدام:
#    bash scripts/prepare-vercel.sh          # ترتيب + فحص + بيلد
#    bash scripts/prepare-vercel.sh --push   # كل اللي فوق + commit و push لـ GitHub
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1;34m'; X='\033[0m'
step(){ printf '\n%b> %s%b\n' "$B" "$1" "$X"; }
ok(){   printf '%bOK %s%b\n' "$G" "$1" "$X"; }
warn(){ printf '%b!! %s%b\n' "$Y" "$1" "$X"; }
die(){  printf '%bXX %s%b\n' "$R" "$1" "$X"; exit 1; }

echo "=============================================="
echo "  ECHO - تجهيز الريبو لفيررشيل"
echo "=============================================="

# ── 1) تنظيف مخلفات البناء ──────────────────────────────────────────────────
step "1/8 تنظيف مخلفات البناء"
rm -rf .next out
rm -f tsconfig.tsbuildinfo
rm -f ./*.log
ok "اتمسحت .next و tsconfig.tsbuildinfo وأي ملفات log"

# ── 2) التأكد من ترتيب البنية ───────────────────────────────────────────────
step "2/8 التأكد من ترتيب البنية"
for d in app components hooks lib public scripts; do
  [ -d "$d" ] || die "المجلد $d مش موجود - البنية مش سليمة"
done
ok "البنية سليمة: app/ components/ hooks/ lib/ public/ scripts/"

SRC_CHECK=(grep -rIn --exclude='*.woff2' --exclude-dir=archive --exclude='prepare-vercel.sh' -e '"src/' -e "'src/" app components hooks lib scripts README.md)
if "${SRC_CHECK[@]}" >/dev/null 2>&1; then
  "${SRC_CHECK[@]}" | head -5
  die "لسه فيه استيرادات من src/ القديمة - صلحها الأول (سكريبتات المايجريشن القديمة في scripts/archive معفية)"
fi
ok "مفيش أي مراجع قديمة لـ src/"

# ── 3) حماية الأسرار ────────────────────────────────────────────────────────
step "3/8 حماية الأسرار (مفيش مفاتيح تترفع)"
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  die "ملف .env متتبع في الجيت - شيله فورًا: git rm --cached .env"
fi
if git grep -nIE '(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})' -- ':!bun.lock' >/dev/null 2>&1; then
  git grep -nIE '(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})' -- ':!bun.lock' | head -5
  die "شكل فيه مفتاح API مكتوب في الكود - راجعه قبل النشر"
fi
ok "مفيش .env ولا مفاتيح API في الملفات المتتبعة في الجيت"

# ── 4) فحص .gitignore ───────────────────────────────────────────────────────
step "4/8 فحص .gitignore"
for p in .vercel .next/ .env node_modules download/ upload/; do
  git check-ignore -q "$p" && ok "${p%/} -> متجاهل صح" || die "${p%/} لازم يكون في .gitignore"
done

# ── 5) إعدادات فيررشيل ──────────────────────────────────────────────────────
step "5/8 إعدادات فيررشيل (vercel.json + engines)"
if [ ! -f vercel.json ]; then
  cat > vercel.json <<'EOF'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["fra1"]
}
EOF
  ok "اتعمل vercel.json - framework: nextjs / region: fra1 (أقرب منطقة لمصر)"
else
  ok "vercel.json موجود بالفعل"
fi

if ! grep -q '"engines"' package.json; then
  node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.engines={node:">=20.9.0"};fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n");'
  ok "اتضافت engines: node >= 20.9.0 في package.json"
else
  ok "engines موجودة بالفعل في package.json"
fi

# ── 6) تثبيت الاعتماديات ────────────────────────────────────────────────────
step "6/8 تثبيت الاعتماديات"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile
elif command -v npm >/dev/null 2>&1; then
  npm ci
else
  die "محتاج bun أو npm يكونو متسطبين على الجهاز"
fi
ok "الاعتماديات متسطبة ومتطابقة مع ملف القفل"

# ── 7) بوابات الجودة ────────────────────────────────────────────────────────
step "7/8 بوابات الجودة: lint -> tests -> build"
if command -v bun >/dev/null 2>&1; then
  bun run lint
  bun run test
  bun run build
else
  npm run lint
  npm test
  npm run build
fi
ok "الـ lint والـ tests والـ production build عدوا كلهم"

# ── 8) التقرير النهائي ──────────────────────────────────────────────────────
step "8/8 التقرير النهائي"
echo ""
echo "المتغيرات الاختيارية (من .env.example) - ضيفها من لوحة فيررشيل لو تحب:"
grep -E '^# ?[A-Z_]+=' .env.example || true
echo ""
echo "خطوات النشر على فيررشيل:"
echo "  1) ارفع الريبو على GitHub (لو مش مرفوع)"
echo "  2) من vercel.com -> Add New Project -> اختار الريبو"
echo "  3) فيررشيل هيكتشف Next.js لوحده - دوس Deploy"
echo "  أو من الترمينال مباشرة: npx vercel --prod"
echo ""

if [ "${1:-}" = "--push" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "chore: prep repo for Vercel (vercel.json, node engines, prep script)"
    ok "اتعمل commit للتغييرات"
  else
    ok "مفيش تغييرات محتاجة commit"
  fi
  git push origin HEAD
  ok "اترفع على GitHub - لو الريبو مربوط بفيررشيل البيلد هيشتغل لوحده"
fi

echo ""
ok "الريبو جاهز لفيررشيل مية المية"
