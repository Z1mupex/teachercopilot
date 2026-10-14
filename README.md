# Teacher Copilot

Teacher workspace using Next.js 16 App Router, React, strict TypeScript, Tailwind
CSS v4, shadcn/ui conventions, Zod, lucide-react and Supabase cookie-based SSR auth.

**Prompts 0–14 are implemented.** Authentication and the protected application
shell are ready. PostgreSQL has 11 application tables with teacher ownership RLS,
automatic profiles and two private Storage buckets. Teachers can create, view,
edit and delete their classes with confirmation. Dashboard shows actual totals,
recent classes, grading batches and worksheets, with empty states. Light, dark
and system themes work across application and auth pages. Teachers can create,
edit, duplicate and reorder four types of worksheet questions, save drafts and
mark worksheets ready. AI generation and individual question regeneration use the
same editor. Generated content is saved only when the teacher chooses to save it.
Teachers can duplicate and edit worksheet variants and download a single
student-facing A4 PDF. Teachers can create grading batches and upload external
JPG/PNG/PDF papers, with one page per submission. Teachers can enter answer keys,
prefill them from selected worksheets, or recognize teacher answer documents
through Groq, review/edit them and explicitly confirm answers and points.
Student recognition, preliminary grading, teacher review and final results are
implemented. Completed batches have question analytics, an error heatmap and
optional AI teaching suggestions. Debate Arena supports local classroom debates,
teacher-controlled timers and scores, events and optional AI topics/English phrases.

## Mobile Batch Scan

Open a grading batch's upload page and choose **Batch Scan · снять стопку работ**.
Set the expected number of sheets (up to 100), open the camera and capture a sheet.
Check/rotate or retake the preview, then choose **Сохранить и следующий**. Confirmed
uploads return immediately to the live camera. Rear camera is preferred; the
teacher can switch cameras, stop it or choose a JPG/PNG from the device instead.

Frames keep the full page, normalize to JPEG quality 88 with a maximum edge of
2400px and use the ordinary private page upload route/server Sharp validation.
Failed uploads retain the same capture ID and a local IndexedDB blob for retry,
including after refresh. Once an upload is attempted, its image is locked for
retry; use the ordinary upload page for later editing. **Готово, к ответам** finishes
the normal upload stage and opens answer entry, without starting recognition/AI.

Camera access is requested explicitly and requires HTTPS on phones; localhost is
usable for local development. Permission denial, busy/missing camera and unsupported
browsers show a photo fallback. Streams stop on hiding/leaving the page. Manual
capture and rotation form this MVP; the guide does not automatically crop or correct
perspective.

## Debate Arena

Open **Debate Arena**, set a statement, language, 1–12 rounds, preparation/speaking
time in seconds and two team names. Participant names are optional, one per line.
Each round has preparation for both teams, a FOR speech and an AGAINST speech.
Start/pause/reset the current timer, advance stages/rounds, adjust scores or swap
sides. Scores stay with their teams. Expiry pauses at zero; the teacher advances
explicitly. Projector mode enlarges the arena and hides setup/AI forms.

SWITCH, SOURCE, QUESTION and EXAMPLE cards suggest activities; selecting one does
not automatically change sides, scores or time. Manual debates work without AI.
Optional Groq generation proposes three topics using subject, grade/level, theme
and language. English requests can also include vocabulary, agreeing/disagreeing
and transition phrases. Choosing a suggestion fills setup; applying it is explicit
and resetting an active debate requires confirmation. Participant names and grading
data are never sent to AI.

This MVP keeps debate state only in the current mounted page. Refreshing or leaving
the page resets it; there is no multiplayer or student phone joining.

## Grading analytics

Open **Аналитика** and choose a completed batch. Its results show final-score
average, median, minimum/maximum, completion and percentage distribution, plus
per-question averages, correct/partial/wrong shares and teacher decisions.
Variants remain separate. The error heatmap uses colors, symbols and accessible
labels; missing results are not counted as wrong. Scores below 60% highlight
questions to revisit; samples below five papers carry a preliminary warning.

**Получить AI-предложение** optionally sends structured aggregate statistics for
up to 20 questions to Groq, excluding student images and individual answers.
**Создать работу по ошибкам** opens the existing generation form with weak
questions prefilled. Generation and saving still require explicit teacher action.

## Student grading and teacher review

After confirming the key, open **Распознать и оценить** and choose each paper's
variant when multiple variants exist. Recognition starts explicitly and processes
two independent submissions at a time. UUID attempts and 180-second leases persist
progress; failed or expired papers can be retried individually. Pausing/closing
the page stops new launches; already submitted requests can finish.

The server scores exact choice sets, safe decimal/fraction equivalence and exact
whitespace-normalized text matches. Semantically significant case is preserved.
Other short answers and open responses use the teacher key/rubric for a preliminary
AI judgment. Missing, blank, unreadable and ambiguous responses always require
teacher review. Careful accepts deterministic matches from 95% confidence; balanced
also accepts short AI judgments from 95%; fast also accepts open judgments against
confirmed criteria from 90%. Custom rules remain available. Confidence is a model
self-assessment, not measured accuracy. Policy lives in `src/lib/grading/policy.ts`.

Review now shows a complete student paper: private original, every answer,
proposed/accepted totals and decision origins. Open a question for its key, rubric
and override controls; move directly to the next exception. Group confirmation
uses selected answers or all eligible proposals of that paper. It validates every
revision atomically and preserves earlier teacher corrections. Blank, unreadable,
ambiguous and missing answers require individual decisions. All preliminary scores
remain editable until explicit finalization. PostgreSQL recomputes final totals
and refuses unfinished jobs or unresolved answers. Results
become read-only and show scores, maxima, percentages and optional recognized names.

Use the existing `GROQ_API_KEY` and optional `GROQ_VISION_MODEL`. Each grading key
is bounded to 28,000 serialized characters; output is bounded up to 6,000 tokens.
Provider quotas produce visible, retryable paper errors. Audit metadata excludes
images, names, answer text and secrets.

## Answer keys and teacher document recognition

After **Завершить загрузку**, select **Добавить ответы**. The editor supports
question order, four question types, correct choices/text/numbers, positive
maximum points, optional rubrics and up to ten variants. Linked worksheet
questions and keys are prefilled for every variant. Changes belong only to
the grading batch; the source worksheet remains unchanged.

Choose **Ввести вручную**, **Фото ответов**, **Файл с ответами**, or
**Решённая работа учителя**. Documents support JPG/PNG and, for the file/solved
sources, PDF. PDF.js renders pages locally. A request accepts up to three
pages, 30 MiB per original file, 6 MiB per normalized JPEG and 12 MiB for the
actual multipart body. No document URLs or public Storage uploads are used.
Teacher documents remain transient and never replace uploaded student papers.

Recognition uses `GROQ_API_KEY` and optional `GROQ_VISION_MODEL`, defaulting to
`qwen/qwen3.8-27b` hosted by Groq; see [Groq vision documentation](https://console.groq.com/docs/vision).
This is independent of the text generation model. Strict Structured Outputs
and Zod validate every result; extraction is capped at 50 visible questions.
Provider quotas/errors remain visible. Manual input/saving works without AI.

**Мы распознали ответы так** shows an editable candidate. Missing points,
unreadable answers, numbering gaps and uncertain fields require teacher review.
Unspecified points suggest 1 with a visible warning. Missing numeric answers
stay blank instead of suggesting zero. **Сохранить черновик** preserves the key
and uncertainty markers. **Подтвердить ответы и баллы** requires complete valid
answers, acknowledgements of uncertain fields and whole-key confirmation.
It never starts student recognition or grading. Editing a confirmed key requires
new confirmation. Navigation with unsaved changes is guarded.

Batch keys reuse normalized worksheets/questions/answer_keys as independent
uploaded snapshots, saved atomically with ownership and revision checks.
Attached snapshots are immutable; edits replace them before recognition starts.
Old snapshots and deleted batches' contexts are removed transactionally.
Contexts are excluded from worksheet/dashboard lists. AI logs contain hashes,
identifiers, duration and token counts only; private reservations enforce quota.

Live Edge checks cover all four manual types, draft/confirmation/reopening,
manual saving with AI disabled, real Groq image and two-page PDF extraction,
uncertainty review, independent edits to linked worksheets with variants,
ownership denial and a 390px dark layout. Temporary QA data is removed.

## Grading batch uploads

Open **Проверка работ → Новая проверка**, enter a title, and optionally select a
class and a ready worksheet. External papers need neither association. Add JPG,
PNG or PDF files, review the page cards, rotate/delete/reorder as needed, then
choose **Загрузить все страницы** and **Завершить загрузку**.

PDF.js 6.4.299 renders every PDF page in the browser. A matching local worker,
CMaps, fonts and image decoders are copied from the pinned package by
`postinstall`, `predev` and `prebuild`; no CDN worker is used. Inputs are limited
to 30 MiB per file and 100 pages per batch. Canvas produces white-background JPEG
pages with a maximum edge of 2400px. Server-side Sharp validates and re-encodes
each image, strips metadata and enforces a 6 MiB body limit before private upload.

Normalized pending pages are saved in batch-scoped IndexedDB for recovery after
reload in the same browser. Successful uploads remove their local blobs. In a
different browser, reselect missing images using each page's file control.
Per-file preparation and per-page upload states expose failures; failed pages
can retry without duplicating successful submissions. **Обновить список** reloads
the authoritative database state after a conflicting change in another tab.

Private images are served through authenticated ownership-checked no-store routes.
Rotation of a stored page creates a new JPEG path and removes the previous blob
through the Storage API. The upload transaction reserves submissions, preserves
page ordering, checks revisions and verifies object existence before `ready`.
There is no student-name requirement or automatic AI processing.

Browser QA covers a two-page PDF, multiple JPGs, transparent PNG, rotation before
and after upload, saved reordering, deletion of both row and blob, pending-page
recovery after reload, a simulated network failure followed by retry, ready-state
reopening, foreign-page/CSRF rejection and a 360px dark layout. SQL assertions run
locally and on Supabase with rolled-back fixtures. Temporary live users and files
are removed after testing.

## Development

Use **Node.js 22+** (required by the pinned Supabase SDK) and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The canonical Git workspace is
`C:\Users\Zimu\.codex\worktrees\1618\teachercopilot`.
`D:\CodexBuild\teachercopilot-1618` is a source mirror; its `.env.local` is preserved.
Make subsequent changes in the Git workspace and keep the mirror in sync if used.

```sh
npm run lint
npm run typecheck
npm run build
npm run format:check
```

`format` writes Prettier formatting. ESLint runs separately from the production
build. `typecheck` generates Next.js route types before checking TypeScript.

## Connect a Supabase project

The user's project `vzskniyornxdrusuzovp` is connected through the ignored
`.env.local`; all checked-in migrations have been applied and tested there.
For another project, follow the configuration steps below and apply the migrations
as described in [supabase/README.md](supabase/README.md). Without valid configuration,
protected routes redirect to login and forms show an unavailable message.

1. Create a Supabase project and obtain its Project URL and **publishable** key
   from the project's Connect dialog.
2. Copy `.env.example` to `.env.local` in the repository root and fill in:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. Keep email/password authentication enabled. Keep email confirmation enabled
   for production. In Auth → URL Configuration, set Site URL to
   `http://localhost:3000` for local development (your HTTPS origin in production).
4. In Auth → Email Templates → Confirm signup, use this confirmation link:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
     Подтвердить email
   </a>
   ```

   The server verifies the email token, writes the session cookies and redirects
   to `/dashboard`. Standard fragment-based confirmation links do not establish
   a server session in this implementation. Expired links return to login with
   a visible error. No email address or password is embedded in the redirect.

5. Restart the development server after changing configuration. For production,
   rebuild with these public variables set (browser values are inlined at build).
6. Verify registration → confirmation email → dashboard → logout → login, then
   reload a protected URL while signed out and verify its redirect to login.

Never put secret/service-role keys in NEXT_PUBLIC variables or browser modules.
Environment validation rejects these keys and names invalid fields without
printing their values. Registration stores full_name in user metadata solely for
display. A private database signup trigger copies that display name into
`profiles`; ownership always uses the verified Auth user UUID.

References: [Supabase SSR setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
and [password authentication](https://supabase.com/docs/guides/auth/passwords).

## Worksheet variants and printable PDF

Choose 1–10 variants in the worksheet editor and apply the count, or copy the
base variant once. New variants copy Variant 1 with independent question and
option identities. Switch between variants to edit questions or request an AI
replacement; rename additional variants as needed. Reducing the count requires
confirmation. Saving validates and writes every variant together; work linked to
grading history remains read-only. There are at most 100 questions per variant
and 300 in the complete document.

Open a saved worksheet and use **Скачать все варианты PDF**. Each variant starts
on a new A4 page with a title, subject/grade if available, variant label, blank
student name/class/date lines, numbered questions, scores and writing space.
Long questions continue onto further pages. Complete conditions and choice
options are required for printing; incomplete drafts produce a visible message.

The authenticated Node route `/worksheets/[id]/pdf` verifies teacher ownership
and reads one consistent database snapshot without answer keys. A strict
student-only DTO strips rubrics, expected answers, selected choices and metadata
before rendering. No student-specific PDFs or QR codes are produced. Downloads
are private/no-store and do not require public Storage. Layout is isolated in
`src/lib/pdf`, using pinned `@react-pdf/renderer` and bundled, licensed Noto Sans
and Noto Sans Math fonts; rendering needs no font CDN or browser library.

## AI configuration and worksheet workflow

Add server-only configuration to `.env.local` and restart the server:

```dotenv
GROQ_API_KEY=your-groq-api-key
# Optional; this is the default when omitted:
GROQ_MODEL=openai/gpt-oss-120b
```

Groq is the configured provider. Choose a model that supports Responses and strict
Structured Outputs. The default works with only `GROQ_API_KEY` configured.
Unsupported models produce a visible error. `OPENAI_API_KEY` and `AI_TEXT_MODEL`
are no longer read; requests do not fall back to OpenAI or another paid provider.
Manual editing works without AI configuration. Never commit `.env.local` or put
the API key in a `NEXT_PUBLIC_` variable.

On `/worksheets/new`, select manual creation or enter AI parameters: subject,
grade, topic, duration, question count, allowed types, difficulty percentages
totalling 100, and optional instructions. Review the generated questions and
answer keys in the normal editor before saving a draft or marking it ready.
Incomplete questions may be saved as drafts; ready worksheets require complete
questions and applicable answer keys. Multiple choice supports several correct
options; numeric answers support an absolute tolerance; open responses support
an optional expected answer and rubric.

Individual regeneration keeps question identity, type, score, difficulty and
topic context. Its candidate replaces the current question only after acceptance.
Saving is explicit. Worksheets linked to grading history remain read-only and
cannot be deleted through this editor. Concurrent saves use an expected revision;
a stale editor reports a conflict instead of overwriting newer work.

AI calls use the existing OpenAI-compatible SDK against the fixed Groq origin
`https://api.groq.com/openai/v1`, through Responses with strict Zod Structured
Outputs. A wire-schema adapter expresses the shared difficulty enum as a pattern
to avoid Groq's ambiguous union discriminator; the original Zod enum still
validates every response. Groq does not support `store`, so it is omitted. Output is
bounded to 6,000 tokens for generation and 2,000 for regeneration; incomplete
responses produce a visible error. Free-tier quotas apply to the organization
and are shared across teachers. See [Groq Responses](https://console.groq.com/docs/responses-api)
and [rate limits](https://console.groq.com/docs/rate-limits).
Server-side transformations validate requested counts, types and
difficulty allocation, assign UUIDs, and produce the shared worksheet domain
objects. Refusals, invalid output, network failures, timeouts, exhausted API
credits and account limits have distinct safe errors.
`ai_runs` stores model, purpose, input hash, status, duration and bounded usage
metadata, without request text, answer text or secrets. A private append-only
reservation ledger enforces 20 requests (60 for grading) per teacher per hour independently of
editable audit rows. Normal concurrent requests are also blocked while a recent
run is pending; grading permits two. That audit-based check is advisory; per-batch
concurrency and attempt leases are enforced separately under a batch lock.

## Routes

| Route                        | Access / purpose                             |
| ---------------------------- | -------------------------------------------- |
| `/`                          | Redirects to `/dashboard`                    |
| `/login`                     | Public email/password sign-in                |
| `/register`                  | Public registration                          |
| `/auth/confirm`              | Public email token verification              |
| `/dashboard`                 | Protected real totals and recent data        |
| `/grading`                   | Protected own grading batches                |
| `/grading/[batchId]/process` | Protected progress and explicit recognition  |
| `/grading/[batchId]/review`  | Protected teacher review queue               |
| `/grading/[batchId]/results` | Protected finalized results                  |
| `/grading/[batchId]/scan`    | Protected camera capture and ordinary upload |
| `/worksheets`                | Protected own worksheet list                 |
| `/worksheets/new`            | Protected manual/AI worksheet editor         |
| `/worksheets/[id]`           | Protected worksheet and answer preview       |
| `/worksheets/[id]/edit`      | Protected worksheet editing                  |
| `/classes`                   | Protected own class list                     |
| `/classes/new`               | Protected class creation                     |
| `/classes/[id]`              | Protected class details/edit/delete          |
| `/analytics`                 | Protected completed-batch analytics          |
| `/debate`                    | Protected local Debate Arena                 |
| `/library`                   | Protected placeholder: Библиотека            |
| `/settings`                  | Protected placeholder: Настройки             |

## Structure and security

- `src/app/(auth)`: login/registration layouts and forms.
- `src/app/(dashboard)`: dynamic protected layout and pages. **Each page** invokes
  `requireUser()` as well as the layout, so layout reuse is not the sole guard.
- `src/lib/auth/session.ts`: request-scoped React cache of `getUser()`; identity is
  checked against the Auth server, never trusted from `getSession()` or user metadata.
- `src/proxy.ts` and `src/lib/supabase/proxy.ts`: verified `getClaims()` refreshes
  cookies before rendering. Cookies reach both the incoming request and outgoing
  response. Redirects preserve cookie mutations and no-cache headers. Invalid or
  expired sessions are denied; provider failures remain visible and fail closed.
- `src/lib/supabase/server.ts`: fresh client for each request. Server Components
  use read-only cookies; actions/route handlers explicitly enable writes. The
  proxy owns refresh. Unexpected writes in renders trigger the SDK's warning
  rather than being hidden by a blanket catch.
- `src/lib/supabase/client.ts`: browser client utility with only public configuration;
  application database access stays server-side. All Supabase clients use the
  generated `src/types/database.ts` schema types.
- `src/actions/auth.ts`: Zod-validated auth mutations with safe messages, pending
  states and cache revalidation. Logout uses local scope (the current session).
- `src/actions/classes.ts`: authenticated, validated class mutations. Browser
  input cannot supply teacher_id. Successful writes revalidate the list, dashboard
  and affected class detail. Deletes require the confirmation value from the dialog.
- `src/lib/classes/repository.ts`: server-only database access with explicit
  teacher/id filters in addition to RLS. Missing/foreign rows are never a successful
  mutation. Malformed, absent or foreign IDs render the not-found boundary.
  Next.js streaming may return HTTP 200 for that boundary while emitting noindex.
- `src/lib/dashboard/queries.ts`: parallel, owned queries with exact totals and
  limited recent rows. Query failures reach the error boundary; they never become
  fabricated zero counts or empty lists.
- `src/lib/validation/classes.ts`: trims names/subjects, converts optional blanks
  to null, preserves zero pupils, and rejects malformed/non-integer numeric input.
  Names allow 100 characters; subjects 120; grades 1–12; pupils 0–2147483647.
- `src/components/classes`: pending/error/success form states and an accessible
  native deletion dialog with cancel focus, Escape handling and a pending guard.
- `src/lib/auth/routes.ts`: shared navigation and a restricted internal redirect
  allowlist. Add future navigation roots here when introducing new routes.
- `src/components/shell`: responsive sidebar/header, mobile navigation and profile
  disclosure with logout, click-outside and Escape handling.
- `src/components/theme`: light/dark/system preference using React context and a
  one-year SameSite=Lax cookie. RootLayout validates and renders data-theme before
  paint; CSS responds to system changes without a script or extra dependency.
  The theme selector is available in both app and auth headers. Cookie use makes
  the root layout dynamic; personalized HTML must not be shared by a CDN.
- `supabase/migrations`: application schema, constraints, RLS and private Storage.
- `src/lib/validation/worksheets.ts`: shared discriminated question schemas and
  draft/ready validation. `src/lib/worksheets` normalizes questions and answer keys.
- `src/actions/worksheets.ts` and `src/lib/worksheets/repository.ts`: owned CRUD,
  atomic database RPCs, revision checks and protection for grading history.
- `src/components/worksheets`: shared manual/AI editor, answer preview and
  confirmation dialogs. Pending operations guard mode changes and navigation.
- `src/lib/ai`: server-only client, prompts, strict provider schemas and generation
  service. `src/actions/ai-worksheets.ts` validates authenticated requests and
  reserves/audits calls; React components receive only domain objects and safe errors.
- `src/lib/pdf`: strict student-only PDF model and local A4 renderer.

`@/*` resolves to `src/*`. UI follows the references: Russian language, blue
accents, rounded cards, and matching light/dark surfaces. No fake classes, scores
or backend APIs. Worksheet source `generated` means created in the application,
including manual creation; `uploaded` remains independent for external papers.

## Verification and security notes

Run `npm run lint`, `npm run typecheck` and `npm run build` for the current
source. The `docs`, `tests` and `supabase/tests` directories, test commands,
PDF fixture generator and test-only PGlite dependency were removed at the user's
request. The prompt 14 audit passed 138 automated tests before that cleanup;
the automated suite is no longer included in this repository.

Production hardening protects final grading states/scores and batch counters at
the database boundary. Private Storage limits submissions to 6 MiB JPEG and
worksheet files to 30 MiB PDF/JPEG/PNG. AI requests have no implicit SDK retries;
lost grading-save acknowledgements recover through the exact owned attempt.
Upload grids use private 640px previews. Grading history is paged; catalogue reads
fetch all metadata through bounded queries. Deliberate logout clears pending
browser papers, while session expiry preserves retry copies.

The audit found five high-severity findings in ESLint's development dependency
chain, all related to the same transitive braces issue. The proposed npm fix
downgrades the Next lint package to version 14 and is incompatible with Next 16.
Use a compatible upstream patch when available. Production dependencies had
zero findings at the prompt 14 audit. See
[the upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Supabase leaked-password checking remains disabled on the free project; the
provider requires Pro or above for that feature. Registration validation and
verified sessions do not substitute for compromised-password screening. See
[Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Confirmation email delivery depends on SMTP/template configuration. Physical
mobile cameras and Safari hardware were not verified during the audit. Further
prompts require the user's review and explicit request to continue. AI scores
remain preliminary and can be overridden by the teacher before finalization.

## Teacher settings

`/settings` now saves the teacher profile, school, subjects/class labels, signature,
grading comparisons, diary scales, library preferences, retention and in-app
notification choices. Russian is enabled; Kazakh and English are planned.
AI careful/balanced/fast presets are active account defaults. Each new batch
requires explicit mode confirmation before recognition; first claim freezes it.

Comparison preferences are frozen at the first grading claim. Short AI judgments
can be auto accepted only when explicitly enabled and above the configured gate;
unsafe recognition always requires manual review. Fast mode can also accept
confident open responses against confirmed criteria. Per-work
FO/control conversion is editable on results without changing answer scores.

Library entries are saved atomically after explicit worksheet save. Image cleanup
retains answers/results and removes only completed-batch originals using Storage
API. Retention runs on site entry or by button; closed-site background cleanup and
email notifications are not configured. No settings silently delete active papers.
