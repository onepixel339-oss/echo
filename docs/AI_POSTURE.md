# ECHO — AI Posture (D-24) and BYO-Key Disclosure Copy (D-29 draft)

**Status:** documented posture (Track A / A0). The BYO-key feature itself is
**not implemented** and remains behind the owner gate D-29; only the
disclosure copy is drafted here, per the transformation plan (Revision 1.3
§10.5, §12.2 stage A0).

**Last verified:** 2026-11-25.

---

## 1. The posture (decision D-24)

ECHO ships with **AI features disabled by default** in the zero-cost stages
(T1 initial build, T2 private beta). This is not a bug or a missing
configuration — it is the designed posture:

- **What is off by default:** the three AI features — Ask ECHO, Taste
  Companion, and the weekly digest. They call same-origin routes
  (`/api/echo/ai/*`) that relay to an LLM provider.
- **Why:** the project's constraint is $0/month with no ECHO-funded AI API
  costs. The only mechanism that can enable them is a user- or
  deployment-provided Gemini key. No paid key is ever shipped, configured, or
  paid for by ECHO.
- **How "off" behaves:** without `GEMINI_API_KEY`, the AI routes return
  `{ ok: false, error: "ai_unavailable" }` (HTTP 200) and the client renders
  its graceful, labelled unavailability state. The rest of the app — library,
  map, stats, recommendations, notes, export — is fully functional and
  unaffected. This is the same degradation path as any AI provider failure.
- **What the fallback actually is (truth in documentation):** the code
  contains a second provider in its chain — the `z-ai-web-dev-sdk` platform
  AI, dynamically imported in `lib/echo/ai/llm.ts`. It has credentials
  **only inside the sandbox this project was developed in**; on any external
  deployment (Vercel or elsewhere) it has no credentials and the chain ends
  in `ai_unavailable`. **No keyless AI provider travels with the code.**
  Earlier documentation described a "free Pollinations" fallback — that claim
  was stale and has been corrected (A0).
- **Model chain:** `gemini-3.8-flash` → `gemini-3.5-flash-lite` (both free
  tier), overridable with `GEMINI_MODEL`. Deprecation check (2026-11-25,
  aistudio.google.com/docs/deprecations): **neither model is deprecated**;
  no shutdown date is announced for either. `gemini-2.5-flash` is deprecated
  (auto-routes to `gemini-3.5-flash-lite` on 2026-12-01) but is not in
  ECHO's chain. Re-check at each release.
- **Local deterministic alternatives:** the taste map, identity cards,
  recommendations and their explanations are computed by the deterministic
  engine and never depend on the AI features. Turning AI off costs none of
  the product's core value.

## 2. Enabling AI (bring your own key)

A deployment or a user who wants the AI features supplies a **free** Gemini
API key (https://aistudio.google.com/apikey) as `GEMINI_API_KEY`. Keys are
never committed, never logged, and never embedded in client code.

## 3. D-29 — BYO-key disclosure copy (DRAFT — feature not yet implemented)

If the owner approves the optional BYO-key mode (client-side storage of the
user's own key, per-request relay through the same-origin route), the
following disclosure copy is shown at the point of entry. It is drafted here
for review; it is not shipped UI.

### English

> **Use your own AI key (optional).** Ask ECHO, Taste Companion and the
> weekly digest can be enabled with your personal Google AI Studio key.
> - Your key is stored **only in this browser**, on this device, and is sent
>   **only** to ECHO's own route on this site, which relays it to Google per
>   request. It is never logged and never shared with anyone else.
> - These features are **free for you to enable but are not a service you
>   pay us for**: your use of Google AI Studio is subject to Google's terms
>   and any quotas or charges are between you and Google. ECHO receives no
>   payment and no data about your Google account.
> - Everything else in ECHO works without a key. You can remove the key at
>   any time in Settings; the AI features simply turn off again.

### Arabic

> **مفتاح AI بتاعك (اختياري).** تقدر تشغّل "اسأل ECHO" و"رفيق الذوق"
> والملخص الأسبوعي بمفتاحك الشخصي من Google AI Studio.
> - مفتاحك بيتخزن **في المتصفح ده على جهازك بس**، وبيتبعت **فقط** لمسار
>   ECHO على الموقع ده، اللي بيمرّره لجوجل مع كل طلب. مش بيتسجل في أي
>   سجل ومش بيتشارك مع أي طرف تاني.
> - الميزات دي **مجانية بالنسبة لك لكنها مش خدمة بتدفعها لنا**: استخدامك
>   لـ Google AI Studio خاضع لشروط جوجل، وأي حصص أو رسوم بينك وبين جوجل.
>   ECHO مش بياخد أي دفعات ولا أي بيانات عن حسابك عند جوجل.
> - كل حاجة تانية في ECHO شغالة من غير مفتاح. تقدر تشيل المفتاح في أي
>   وقت من الإعدادات، وميزات الـ AI هتقف تاني ببساطة.

## 4. Where this posture is stated elsewhere

- `README.md` — "AI is off by default" (quick start + known limitations).
- `DEPLOY-AR.md` — the corrected Arabic deployment guidance (no Pollinations
  claim).
- `.env.example` — the AI variables block.
- `lib/echo/ai/llm.ts` — the provider chain implementation (source of truth
  for the behaviour described above).
