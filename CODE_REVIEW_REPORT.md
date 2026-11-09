# 📊 Apex Chatbot — Code Review Report & Fix Plan

**Date:** 2026-10-24
**Scope:** Full repo exploration (frontend, Supabase schema, Edge Functions, Vercel API, widget, plans)
**Build check:** `npm run build` → ✅ `vue-tsc` + `vite build` pass (0 type errors, ~4s bundle)

---

## 1. Executive Summary

**Verdict: a polished, well-structured frontend wrapped around a backend that isn't finished.**

The UI would pass for production: consistent Composition API, one design language, clean component split, zero type errors. The backend has a non-deploying function, a missing dependency, a silent embedding bug, a fake paid feature, and **secrets committed to git**.

Estimated effort to reach "safe to charge money": **~2–3 days of focused backend work.**

### Scorecard

| Area | Grade | Notes |
|---|---|---|
| Frontend / UI code | **A-** | Consistent `<script setup>`, Tailwind, lucide icons, good `pages/` vs `components/` split |
| Type safety / build | **A** | `vue-tsc` clean, no suppressions found |
| DB schema / RLS design | **B** | Idempotent, RLS on all tables, vector index, usage metering — but 4 policy gaps |
| Edge functions / backend | **D** | Missing import file, model mismatch, no rate limiting |
| Feature completeness | **C** | PDF support is fake; website training pipeline broken end-to-end |
| Security / secrets | **F** | `.env` tracked in git with Stripe + Groq secrets |
| Testing / CI | **F** | Zero tests, zero CI, two competing lockfiles |

---

## 2. What's Genuinely Good

- ✅ **Frontend quality is the strongest part.** Nothing felt sloppy; one coherent design system (rounded cards, orange accent).
- ✅ **Builds clean.** Verified: `npm run build` passes with 0 type errors.
- ✅ **Schema is thought through.** Idempotent `schema.sql`, RLS enabled on every table, `match_knowledge_chunks()`, monthly usage with `on conflict` upsert, plan-limit helper.
- ✅ **Stripe webhook does real signature verification** (`constructEventAsync`) — most hobby projects skip this.
- ✅ **`plan/` docs are unusually disciplined** — problem → diff → acceptance criteria, checklist matches git history.
- ✅ **Widget loader is polished** — 4 corner positions, mobile fullscreen, smooth transitions.

---

## 3. Issues Found (Prioritized)

### 🔴 CRITICAL

| # | Issue | Evidence |
|---|---|---|
| **C1** | **Secrets committed to git.** `.env` is *tracked* (`git ls-files` confirms) and `.gitignore` does not list it. Contains `VITE_STRIPE_SECRET_KEY`, `VITE_GROQ_API_KEY`, `VITE_STRIPE_WEBHOOK_SECRET` — present in commit history (`4455be4`). | `.env`, `.gitignore` |
| **C2** | **Website-training pipeline broken end-to-end.** (a) `import_website_training/index.ts` imports `../_shared/cors.ts` — **the file does not exist**, function won't deploy. (b) `api/crawl.js` imports `langchain/...` — **langchain is in neither lockfile nor `package.json`**, the Vercel function 500s. | `supabase/functions/import_website_training/index.ts:2`, `api/crawl.js:1-3` |
| **C3** | **Embedding model mismatch → silent garbage search.** Training embeds with `text-embedding-ada-002`, chat queries with `text-embedding-3-small`. Both 1536-dim but **different vector spaces** — similarity scores are noise. Only surviving because of keyword-search + "last 5 chunks" fallbacks stacked on top. | `import_website_training/index.ts:9`, `chat/index.ts:69` |

### 🟠 HIGH

| # | Issue | Evidence |
|---|---|---|
| **H1** | **PDF support is fake.** `CreateBot.vue` stores the literal string ``PDF uploaded: ${filename}`` as the only knowledge chunk — while the landing page sells "PDF & Doc support" as a **paid Pro feature**. Refund risk. | `src/pages/CreateBot.vue:151-161`, `src/pages/Index.vue:47` |
| **H2** | **Widget likely can't read the bot (RLS).** No public `SELECT` policy on `chatbots`, yet `Widget.vue` reads `chatbots` as an anonymous visitor → `bot` stays `null` → widget renders nothing on customer sites. | `supabase/schema.sql:92-94`, `src/pages/Widget.vue:19` |
| **H3** | **Open abuse surface.** `/api/crawl` is unauthenticated + `Access-Control-Allow-Origin: *` + fetches an arbitrary URL server-side (**SSRF**) while spending your OpenAI credits. The `chat` function bills usage to the bot *owner* **before** the AI call — a hostile visitor can drain a customer's monthly quota, and failed calls count too. | `api/crawl.js:5`, `chat/index.ts:58-77` |
| **H4** | **RLS write gaps.** `messages`/`conversations` insert policies are `with check (true)` → anyone can spam rows into any conversation. `profiles` has **no INSERT policy** but `Settings.vue` uses `.upsert()` → likely RLS error on Save. `enforce_plan_bot_limits()` is defined and **never called**. | `supabase/schema.sql:104-135`, `src/pages/Settings.vue:103` |

### 🟡 MEDIUM

| # | Issue | Evidence |
|---|---|---|
| **M1** | **Two lockfiles** (`package-lock.json` + `pnpm-lock.yaml`) → dependency drift. `pnpm build` currently fails with `ERR_PNPM_IGNORED_BUILDS`. | repo root |
| **M2** | **Dead / conflicting deps.** `jquery@4` and `@popperjs/core` installed and unused. `AOS` loaded in `main.ts` despite `AI_RULES.md` saying use `@vueuse/motion` (**both** are loaded). | `package.json`, `src/main.ts` |
| **M3** | **Three product names.** README + `package.json` say *Apex Chatbot*, widget footer says *OmniSync AI*, `plan/` says *OmniSync AI*. | `README.md`, `src/pages/Widget.vue:128` |
| **M4** | **Plan limits inconsistent across files.** `enterprise` = `1000` (schema, Settings) vs `100` (Dashboard) vs "Unlimited" (UI copy). | `schema.sql:177`, `Dashboard.vue:32`, `Settings.vue:27` |
| **M5** | **No tests, no CI.** 0 test files detected in the repo. | repo root |
| **M6** | **Widget position settings half-wired.** `BotAppearance.vue` offers `left`/`right`, but `widget-loader.js` expects `bottom-left`/`top-right`/… and `BotEmbed.vue` never passes `position` in the embed code. | `BotEmbed.vue:9-17`, `widget-loader.js:24` |
| **M7** | **Bilingual code comments** (Arabic/English mixed in the same files) — fine personally, hurts any collaborator. | `chat/index.ts`, `schema.sql` |

---

## 4. 🛠️ Issue Fixer Plan

> Same format as the existing `plan/` docs: problem → fix → acceptance criteria.
> Recommended order: do Phase 0 today, Phases 1–2 before any deployment, Phase 3 before charging anyone.

---

### ⚡ PHASE 0 — Emergency (today, ~1 hour)

#### FIX-0.1 — Rotate & untrack secrets `[C1]`

**Files:** `.env`, `.gitignore`

1. **Rotate first** (before touching git): new Stripe secret key + new webhook signing secret in Stripe dashboard, new Groq API key. Update them in Supabase → Settings → Secrets.
2. Add to `.gitignore`:
   ```gitignore
   .env
   .env.local
   .env.*.local
   ```
3. Untrack (keep local file): `git rm --cached .env`
4. Commit the removal.
5. ⚠️ Optional deeper cleanup: history still contains the old keys — rotating makes that moot. Rewriting history (`git filter-repo`) only matters if the repo is shared/public.

**Acceptance:**
- [ ] `git ls-files | grep -i env` returns nothing except `src/env.d.ts`
- [ ] `git check-ignore .env` returns `.env`
- [ ] Old Stripe/Groq keys are dead in their dashboards
- [ ] Supabase secrets updated → chat + checkout still work

---

### 🔧 PHASE 1 — Make core features work (~1 day)

#### FIX-1.1 — Create the missing `_shared/cors.ts` `[C2a]`

**File:** `supabase/functions/_shared/cors.ts` *(new)*

```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

Then align `import_website_training` to either use this file *or* define `corsHeaders` inline (as `chat/index.ts` already does) — pick one style and use it everywhere.

**Acceptance:**
- [ ] `supabase functions deploy import_website_training` succeeds
- [ ] No `../_shared/` import points at a non-existent file (`grep -rn "_shared" supabase/functions`)

#### FIX-1.2 — Install the crawler's dependencies `[C2b]`

**File:** `package.json`

```bash
npm install langchain @langchain/community @langchain/openai cheerio
```
(Or replace LangChain entirely — see FIX-3.3 — but if you keep `api/crawl.js` as-is, its imports must resolve.)

**Acceptance:**
- [ ] `grep -n langchain package.json` finds the dependency
- [ ] `curl -X POST $VERCEL_APP_URL/api/crawl -d '{"website_url":"https://example.com"}' -H 'Content-Type: application/json'` returns `{"success":true,...}`
- [ ] Deployed Vercel function does not 500

#### FIX-1.3 — Unify the embedding model `[C3]`

**Files:** `supabase/functions/import_website_training/index.ts`, `supabase/functions/chat/index.ts`

- **Decide one model:** `text-embedding-3-small` (cheaper, newer, 1536-dim — column stays `vector(1536)` ✅).
- `import_website_training/index.ts:9`: change `text-embedding-ada-002` → `text-embedding-3-small`.
- `api/crawl.js`: pass `{ model: 'text-embedding-3-small' }` to `OpenAIEmbeddings` (or drop embeddings there entirely — see FIX-3.3, the edge function regenerates them anyway).
- **Re-embed existing data:** all rows in `knowledge_chunks` produced with `ada-002` are invalid for the new query model. Write a one-off re-embed script, or simplest: **re-train every existing bot** (re-run crawl for each).

**Acceptance:**
- [ ] `grep -rn "text-embedding" supabase/ api/` shows exactly one model name
- [ ] A question whose answer is in chunk content returns that chunk with similarity clearly above 0.3 (not 0.05)
- [ ] Vector search returns sensible results *without* relying on the keyword fallback

#### FIX-1.4 — Fix RLS: public widget read + write gaps `[H2][H4]`

**File:** `supabase/schema.sql` (+ run in SQL editor)

```sql
-- 1. Public can read ACTIVE bots (this is what the widget needs)
drop policy if exists "Public can read active chatbots" on chatbots;
create policy "Public can read active chatbots"
  on chatbots for select using (is_active = true);

-- 2. Tighten message spam: only inside a conversation you may touch
drop policy if exists "Anyone can insert messages (widget + chat function)" on messages;
create policy "Insert messages only into existing conversations"
  on messages for insert with check (conversation_id in (select id from conversations));

-- 3. Allow authenticated users to insert their own profile row (Settings upsert)
drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- 4. Block anonymous conversation spam on foreign bots? keep `with check (true)`
--    on conversations (widget is anonymous by design) — but restrict columns
--    via app logic: reject visitor_id longer than 300 chars.
```

Then **call** `enforce_plan_bot_limits(p_user_id, p_plan)` from:
- the Stripe webhook after a plan change, and
- `Settings.vue` downgrade flow (or a `SECURITY DEFINER` RPC `set_own_plan(plan)` that updates the profile *and* calls the limiter atomically).

**Acceptance:**
- [ ] Open `/widget?id=<bot>` in a **logged-out** browser → bot name, welcome message and colors render
- [ ] `Settings.vue` → Save Changes shows "Profile updated successfully" (no RLS error)
- [ ] Anonymous `insert into messages ... values (..., conversation_id: 'random-uuid')` **fails**
- [ ] `grep -rn enforce_plan_bot_limits src supabase` finds ≥1 call site outside `schema.sql`

---

### 🛡️ PHASE 2 — Abuse & billing safety (~0.5 day)

#### FIX-2.1 — Lock down `/api/crawl` `[H3]`

**File:** `api/crawl.js`

1. Require a shared secret: `if (req.headers['x-internal-key'] !== process.env.CRAWL_SECRET) return res.status(401)...` — and send that header from `import_website_training`.
2. Keep `Access-Control-Allow-Origin: *` only if the browser must call it directly (it shouldn't — the edge function calls it). Prefer removing it.
3. **SSRF guard:** parse the URL, reject private/loopback ranges:
   ```js
   const u = new URL(website_url);
   if (!['http:','https:'].includes(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname))
     return res.status(400).json({ error: 'URL not allowed' });
   ```
4. Add a simple per-IP rate limit (in-memory counter is fine on a serverless fn with a short TTL).

**Acceptance:**
- [ ] `curl -X POST /api/crawl` **without** the key → 401
- [ ] `curl ... -d '{"website_url":"http://169.254.169.254/"}'` → 400
- [ ] Legit crawl from CreateBot still works

#### FIX-2.2 — Fix usage metering order + quota drain `[H3]`

**File:** `supabase/functions/chat/index.ts`

1. Move `increment_message_usage` to **after** a successful Groq response (and only when `reply` exists).
2. Add a lightweight rate limit: reject if >N requests per bot in the last 60s (in-memory Map keyed by `bot_id` is acceptable for a single isolate).
3. Handle Groq failure explicitly before indexing `result.choices[0]`:
   ```ts
   if (!aiRes.ok || !result?.choices?.[0]) throw new Error(`Groq error: ${result?.error?.message ?? aiRes.status}`)
   ```
4. (Bigger win) Move the limit check into a `SECURITY DEFINER` RPC that does `select ... for update` so concurrent requests can't overshoot the cap.

**Acceptance:**
- [ ] Force a Groq error → user gets the offline message, **usage counter does not increment**
- [ ] 50 rapid-fire requests from one IP → excess requests rejected, no quota burn
- [ ] Reaching the monthly cap → widget shows the limit message

---

### 📦 PHASE 3 — Product honesty & cleanup (~1 day)

#### FIX-3.1 — Make PDF real **or** remove the claim `[H1]`

**Option A (implement, ~half day):** upload to Supabase Storage (`knowledge-pdf` bucket), extract text server-side in an Edge Function (pdf-lib / pdfjs polyfill) or send to a PDF-parse API, chunk with the same `chunkText()` logic, insert into `knowledge_chunks`. Gate on Pro exactly as now.

**Option B (delete the claim, ~10 min):** remove the PDF card from `CreateBot.vue`, remove "PDF & Doc support" from `Index.vue` pricing, remove `canUsePDF`.

> Recommendation: **Option B now, Option A when you have paying users.** Selling a non-functioning paid feature is worse than not having it.

**Acceptance:**
- [ ] Every feature listed in pricing exists and works, or is removed from the pricing table
- [ ] If Option A: upload a 5-page PDF → bot answers a question found only in that PDF

#### FIX-3.2 — Dependency & lockfile hygiene `[M1][M2]`

```bash
npm uninstall jquery @popperjs/core aos @types/aos
rm pnpm-lock.yaml        # single source of truth: package-lock.json (build is npm-based)
rm repomix-output.xml    # already gitignored, delete the file too
```
- Remove the `AOS.init()` block from `src/main.ts` (keep `MotionPlugin` — it's what `AI_RULES.md` mandates).
- If `npm run build` needs it: add `"packageManager": "npm@..."` note in README.

**Acceptance:**
- [ ] Only `package-lock.json` exists
- [ ] `grep -rn "jquery\|AOS" src` returns nothing
- [ ] `npm run build` still passes; landing page animations still play (via `@vueuse/motion`)

#### FIX-3.3 — *(Optional)* Replace LangChain in `api/crawl.js`

LangChain + Cheerio for "fetch one page and split text" is ~40 lines of `fetch` + a naive splitter. Dropping it removes an entire dependency class and FIX-1.2 becomes unnecessary. Keep only if you plan multi-page crawling soon.

**Acceptance:** `api/crawl.js` has no `langchain` imports, crawl still returns chunks.

#### FIX-3.4 — One product name `[M3]`

Pick one (widget footer says **OmniSync AI**, README says **Apex**). Update: `README.md`, `package.json` `name`, `src/pages/Widget.vue` "Powered by", `src/pages/Index.vue` hero, `index.html` `<title>`, `plan/README.md`.

**Acceptance:** `grep -rin "apex\|omnisync" README.md package.json index.html src/ | wc -l` shows only the chosen name.

#### FIX-3.5 — Centralize plan limits `[M4]`

Create one module `src/config/plans.ts`:
```ts
export const PLAN_BOT_LIMITS    = { starter: 1, pro: 5, enterprise: 1000 } as const;
export const PLAN_MESSAGE_LIMITS = { starter: 1000, pro: 10000, enterprise: Infinity } as const;
```
Import it in `Dashboard.vue`, `Settings.vue`, `CreateBot.vue`; mirror the same numbers in `schema.sql`'s `enforce_plan_bot_limits` and `chat/index.ts`'s `MESSAGE_LIMITS`.

**Acceptance:** `grep -rn "starter: 1\b" src/` finds the values in exactly one file.

#### FIX-3.6 — Finish widget position `[M6]`

- `BotEmbed.vue`: add `widgetPosition: "<left|right>"` to the generated snippet (read it from the bot's saved settings).
- `widget-loader.js`: accept both vocabularies — map `left` → `bottom-left`, `right` → `bottom-right`, keep the 4-corner values.

**Acceptance:** set position to *left* in Bot Appearance → copy embed code → paste on a test page → widget appears bottom-left.

#### FIX-3.7 — Minimal test + CI baseline `[M5]`

No need for a framework overhaul — 3 high-value tests:
1. **Unit:** `chunkText()` splits long text correctly (`vitest`).
2. **SQL smoke:** RLS policies — anon can `select` an active chatbot, cannot `insert` messages into a random conversation.
3. **Build gate:** GitHub Action running `npm ci && npm run build` on every push.

**Acceptance:**
- [ ] `npm test` exists and passes
- [ ] Green checkmark on the repo's latest commit

---

## 5. Roadmap Summary

| Phase | Effort | Unblocks |
|---|---|---|
| **0 — Secrets** | 1 h | Safe repo |
| **1 — Core features** | 1 day | Website training + widget actually work |
| **2 — Abuse/billing** | 0.5 day | Safe to invite real traffic |
| **3 — Honesty & cleanup** | 1 day | Safe to charge money |
| **Total** | **~2.5 days** | |

**Do not skip Phase 0.** Everything else is fixable later; leaked keys are not.

---

## 6. Addendum — Additional Findings (2nd pass)

Issues not covered in the sections above, verified against the code.

| # | Severity | Issue | Evidence |
|---|---|---|---|
| **A1** | 🔴 | **Billing is not recurring.** Checkout uses `mode: 'payment'` with inline `price_data` — one-time charges, not subscriptions. The UI sells "10,000 messages/**mo**", but there is no renewal, cancellation, or subscription lifecycle: pay once, keep the plan forever until a manual downgrade. | `create-checkout-session/index.ts:37-52`, `Settings.vue:47` |
| **A2** | 🟠 | **Quota check race + null bypass.** `get_current_usage` and `increment_message_usage` are two separate RPCs → concurrent requests overshoot the cap. Worse: if the `profiles` row is missing, `currentUsage.data >= limit` evaluates as `null >= 1000` → `false` → **unlimited free messages**. | `chat/index.ts:55-77` |
| **A3** | 🟠 | **Client-supplied `history` is raw prompt material.** The chat function splices the client's `history` array straight into the Groq messages — anyone can POST `history: [{role: "system", content: "...ignore everything..."}]` and hijack the bot persona. Must be sanitized server-side to `user`/`assistant` roles only. | `chat/index.ts:150-155`, `Widget.vue:76` |
| **A4** | 🟡 | **PostgREST query injection in keyword search.** User text is interpolated raw into `.or(content.ilike.%${term}%)` — commas/parens in a visitor message corrupt or manipulate the filter. Escape terms or use full-text search instead. | `chat/index.ts:96-104` |
| **A5** | 🟡 | **Two competing downgrade mechanisms.** `Settings.vue` manually picks which bots stay active; `enforce_plan_bot_limits()` auto-disables by `created_at` — and the function's own comments contradict each other ("newest first" vs "oldest stays active"). Pick one path and delete the other. | `schema.sql:179-207`, `Settings.vue:180-215` |
| **A6** | 🟡 | **Type safety "A" is cosmetic.** `vue-tsc` passes, but nearly everything is `ref<any>` (`bot`, `profile`, `chunks`, `history`). The types provide almost no real coverage — grade B- in practice. | e.g. `Widget.vue:6-10`, `Dashboard.vue:27-28` |

### Suggested placement in the phases

- **A1** → joins **Phase 3** ("safe to charge money" now also means: real subscriptions or honest one-time copy).
- **A2, A3, A4** → joins **Phase 2** (abuse & billing safety). A2 folds into FIX-2.2's atomic-RPC work; A4 adds one escape step.
  ```ts
  // chat/index.ts — sanitize history + escape search terms
  const safeHistory = (history || []).slice(-6)
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  const escapeLike = (s: string) => s.replace(/[%(,)_\\]/g, c => '\\' + c);
  ```
- **A5** → small addition to FIX-3.5 (centralize plan logic, including which bots survive a downgrade).
- **A6** → no dedicated fix; note it when adding tests (FIX-3.7) — new code should stop the `any` habit.

### Fix-0.1 addendum

Also add a **`.env.example`** (safe, non-verified placeholder values) when untracking `.env`, and document: **`VITE_*` variables are compiled into the browser bundle — secrets must never use that prefix.** All four mis-prefixed secrets (`VITE_GROQ_API_KEY`, `VITE_STRIPE_SECRET_KEY`, `VITE_STRIPE_WEBHOOK_SECRET`) already reference secrets that exist only as Supabase/Deno secrets — delete them from `.env` entirely; the frontend needs neither of the three.
