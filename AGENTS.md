<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Teacher Copilot architecture

- Prefer Server Components. Add Client Components only for interaction.
- Keep database access server-side unless realtime/client access is required.
- Never put AI provider keys or Supabase service-role/secret keys in browser code.
- Avoid global state libraries; do not add Redux or Zustand.
- Keep business logic out of React components.
- Use feature-oriented reusable components and shared UI in src/components/ui.
- Use TypeScript strict mode. Avoid any unless absolutely unavoidable.
- Validate external inputs with Zod. Never silently swallow errors.
- Do not build speculative abstractions or add unnecessary dependencies.
- AI grading is preliminary. Send low-confidence answers to teacher review;
  teachers must be able to confirm or override proposed scores.
- External student papers must remain supported independently of generated worksheets.

# Project conventions and scope

- Use src/app, src/components, src/lib, src/actions, src/types and supabase/migrations.
- Import project modules with @/* (resolves to src/*).
- Use Tailwind CSS and shadcn/ui with lucide-react icons.
- Use React Hook Form when forms justify it, and Zod for validation.
- Use Supabase PostgreSQL, Auth and Storage with cookie-based SSR clients.
- Node.js 22+ is required by the pinned Supabase SDK.
- Use src/proxy.ts (Next.js 16 convention) for verified session refresh.
- Preserve refreshed cookies and no-cache headers on responses and redirects.
- Call requireUser() in every protected page and mutation; layout checks alone are insufficient.
- Server Components use read-only cookies; explicitly enable writes in actions/route handlers.
- Never add an auth bypass for preview/development or trust getSession() for authorization.
- Missing Supabase configuration must fail closed. User metadata is for display only.
- Groq integration belongs behind the server-only service abstraction in src/lib/ai.
  Read GROQ_API_KEY and optional GROQ_MODEL through env.ts; default to openai/gpt-oss-120b.
  The existing OpenAI SDK points only to the fixed Groq API origin; it sends no requests to OpenAI.
- Use two-space indentation, double quotes, semicolons and trailing commas (Prettier).
- Read required environment through src/lib/env.ts; errors must name variables, never values.
- Run npm run lint, npm run typecheck and npm run build after changes.
- Complete only the prompt explicitly authorized by the user. Prompt 0 establishes
  the foundation; auth/application shell belong to prompt 1, schema/RLS to prompt 2.
- Prompts 0–14 are implemented. Class/worksheet CRUD and real dashboard queries run server-side
  on the connected Supabase project. Mutations derive teacher_id from requireUser(),
  filter by ownership, validate with Zod, and revalidate classes/detail/dashboard.
- Supabase clients use generated Database types from src/types/database.ts.
- Read supabase/README.md for ownership paths, immutable parent links and deletion behavior.
- Storage paths begin with the teacher UUID. Use the Storage API for blob deletion.
- Missing or foreign classes render the not-found boundary; zero-row mutations return an error.
- Class deletion requires an explicit confirmation and preserves grading history.
- Light/dark/system themes use a validated teacher-copilot-theme cookie and CSS
  prefers-color-scheme. RootLayout renders the preference on the server; use semantic
  colors or an explicit dark variant for colored surfaces. No auth bypass exists.
- Worksheets use a shared Zod domain model for manual and AI editing. Save normalized
  questions and answer keys atomically through ownership-scoped RPCs with revision checks.
- AI suggestions and regeneration candidates are never automatically persisted.
  Keep the Groq-compatible Responses/strict Structured Outputs integration server-only.
  Groq does not support the store parameter; omit it. Bound output for free-tier quotas.
- Base worksheet questions retain variant_id NULL (Variant 1). Up to nine additional
  variants have stable UUIDs, independent question/option identities and answer keys.
  Save all variants atomically with a revision check; any linked grading batch locks edits.
- Printable PDFs use a strict student-only model in src/lib/pdf. The authenticated
  Node route verifies ownership and selects no answer_keys. No keys, rubrics, selected
  choices, student identities or external resources enter the renderer. Responses are
  private/no-store. Bundle local Noto Sans/Math fonts, keep each variant on a new A4 page.
- AI audit metadata must exclude secrets and request/answer text. Enforce the hourly
  quota through private append-only reservations, independently of public audit rows.
- Grading upload is one page per submission, with optional class/worksheet associations.
  PDF.js renders pages locally; browser canvas and server Sharp normalize JPEGs.
  Keep private images behind ownership-checked routes. Page order and completion use
  manage_grading_upload with a batch lock and revision checks; ready requires stored blobs.
  Pending blobs may live in batch-scoped IndexedDB for retry; remove them after upload.
  Never start recognition or AI grading automatically. Delete blobs through Storage API.
- Do not begin further prompts until the user reviews and requests continuation.
- Batch answer keys use an independent uploaded worksheet snapshot, with the original
  worksheet link retained. Save through save_grading_answer_key with a batch revision;
  replacement is allowed only before recognition/results, and resets confirmation.
  Attached snapshots are immutable. Preserve all variants when prefilling/copying keys.
- Answer document parsing uses server-only Groq Chat Completions with strict JSON and
  optional GROQ_VISION_MODEL (default qwen/qwen3.8-27b). Normalize up to three local
  JPG/PNG/PDF pages and bound the actual request body before parsing multipart.
  Never persist candidates or confirm them automatically. Require explicit teacher
  confirmation of all answers/points and acknowledgements of uncertain fields.
  Neither document parsing nor confirmation starts student recognition or grading.
- Visual direction: Russian UI, light surfaces, subtle borders, blue accents,
  generous spacing and rounded cards. Reference images guide future feature UI.
- Student grading is explicit, one submission per authenticated request, concurrency 2.
  claim_grading_submission assigns a UUID attempt and 180-second lease. Completion
  requires that exact live attempt and the complete selected-variant question set.
  Failures affect only that paper; stale attempts cannot overwrite a retry.
- Grading policy lives in src/lib/grading/policy.ts. Choice/numeric/exact text scores
  are computed deterministically. Missing/blank/ambiguous/unreadable and all AI-judged
  or open responses require teacher review. Preserve semantically significant case.
- review_grading_answer checks ownership, answer revision and score bounds. Finalization
  recomputes totals in PostgreSQL and requires complete jobs with no needs_review answers.
  Started workflow rows cannot be edited directly. Completed results are read-only;
  unreadable is an explicit teacher decision assigning zero.
- Reviews page 40 answers at a time. Original images and normalized-coordinate crops
  stay behind owned no-store routes. Never accept remote crop URLs or browser totals.
- Analytics uses final scores from owned completed batches. Keep variant question
  identities separate and missing scores distinct from wrong answers. Fetch every
  result with bounded pagination; never silently truncate at a REST row limit.
  Optional grading_summary AI receives whitelisted aggregates only and shares the
  existing private quota. Follow-up worksheet parameters are server-derived;
  generation and saving remain explicit teacher actions.
- Debate Arena is independent of grading. Its validated setup, teams, scores and
  timer remain local to the mounted client. Use monotonic deadlines, pause at zero
  and advance phases only explicitly. Side swaps preserve team identity/scores.
  Data-driven event cards never automatically change timer/sides/scores. Optional
  debate_topics AI uses the existing server-only structured service and private
  quota; never send participant names or grading data. Topic application is explicit.
- Batch Scan is an owned /grading/[batchId]/scan page using the existing upload
  hook, RPC and private JPEG route. Camera permission is explicit, video-only;
  stop tracks on hide, exit and stale permission responses. Preserve the full
  frame, bound to MAX_EDGE and normalize through canvasJpeg and server Sharp.
  Persist confirmed captures locally before network work; immutable capture IDs
  and authoritative refresh recover lost acknowledgements without duplicates.
  Review/rotation precede upload. Never auto-start recognition or grading.
- Hardening rejects direct final states/scores even before recognition. Batch counters
  are workflow-only; upload, claim and finalization derive them from actual rows.
  Private Storage enforces 6 MiB JPEG submissions and 30 MiB PDF/JPEG/PNG worksheets.
  Groq SDK automatic retries are disabled. Recover a lost save acknowledgement only
  by reading the exact owned grading attempt; never rerun recognition implicitly.
  Grading history pages 20 batches; thumbnails are owned 640px no-store JPEGs.
  Deliberate logout clears pending browser papers through an explicit cleanup flag;
  session expiry preserves retry copies. Keep external audit findings documented in
  README.md; do not downgrade Next lint dependencies blindly.
