# Database and private files

Local migration files, in execution order:

1. `migrations/20261005164853_teacher_copilot_schema.sql`
2. `migrations/20261005164858_private_teacher_storage.sql`
3. `migrations/20261005165809_grading_context_locks.sql`
4. `migrations/20261005180223_worksheet_editor_transactions.sql`
5. `migrations/20261006165030_worksheet_variants.sql`
6. `migrations/20261011062108_grading_uploads.sql`
7. `migrations/20261011065412_answer_key_review.sql`
8. `migrations/20261011071515_answer_key_lifecycle.sql`
9. `migrations/20261011072615_answer_key_ownership_index.sql`
10. `migrations/20261011130005_preliminary_grading_and_teacher_review.sql`
11. `migrations/20261011154610_grading_analytics_ai_summary.sql`
12. `migrations/20261013104958_debate_topics_ai.sql`
13. `migrations/20261013121214_production_hardening.sql`
14. `migrations/20261013171341_teacher_settings_and_preferences.sql`
15. `migrations/20261013173057_settings_validation_followup.sql`
16. `migrations/20261013174219_review_notification_counts.sql`

For a new Supabase project, run these files in order in the SQL Editor or through
the Supabase migration workflow. Do not rerun them on the connected project.
Auth and Storage schemas must already exist; migrations assert that
`storage.objects` has RLS enabled. Buckets are created by the second migration,
so no separate manual bucket setup is needed. No migration contains secrets.

## Ownership and privileges

All fifteen public application tables have RLS. Policies target `authenticated`,
with explicit grants; `anon` has no application table privileges. Ownership uses
`(select auth.uid())` and parent relationships, never editable user metadata.
`USING` filters readable/updatable/deletable rows and `WITH CHECK` validates writes.

| Table                                            | Ownership path                                           |
| ------------------------------------------------ | -------------------------------------------------------- |
| profiles                                         | id = auth.uid()                                          |
| classes, worksheets, grading_batches, ai_runs    | teacher_id = auth.uid()                                  |
| worksheet_variants, questions                    | worksheet_id → worksheets.teacher_id                     |
| answer_keys                                      | question_id → questions → worksheets.teacher_id          |
| submissions                                      | batch_id → grading_batches.teacher_id                    |
| submission_pages, submission_answers             | submission_id → submissions → grading_batches.teacher_id |
| private.ai_request_reservations                  | teacher_id = auth.uid()                                  |
| teacher_settings, teacher_library_entries        | teacher_id = auth.uid()                                  |
| teacher_notifications, removed_submission_images | teacher_id = auth.uid(), with owned parent validation    |

Answers additionally validate their question's worksheet and variant against the
submission's batch. Composite foreign keys prevent linking a batch to another
teacher's class or worksheet. Identity/ownership parent fields are immutable;
general UPDATE cannot transfer records or replace the worksheet of a linked batch.
Validation triggers use invoker privileges, respect RLS and lock parent rows
against concurrent updates. The third migration also locks answered questions
and their submissions during variant edits, so simultaneous changes cannot each
validate an outdated version of the other row. PostgreSQL aborts conflicting
transactions on a deadlock; future mutation workflows must report/retry failures
rather than treating them as success. Indexes cover ownership, foreign keys and
list paths.

Teachers can read their own profile and update only `full_name` and `school_name`.
Profile insertion belongs to a private `auth.users` trigger. This is the sole
`SECURITY DEFINER` function, has an empty search path, accepts only signup events
and has no API execute grants. It uses `NEW.id` for identity and copies a bounded
string display name from metadata. The first migration also backfills profiles
for existing accounts. Other private trigger functions have no RPC grants.

## Constraints and future workflows

- Primary keys are UUIDs. Variant, question and page ordering starts at zero;
  positions are unique within their parent. A null question variant denotes a
  shared question, with unique ordering there too. Question position uniqueness
  is now deferred until transaction commit so existing question identities can
  swap positions during an atomic save.
- Counts and scores cannot be negative; scores reject NaN/infinity. Confidence
  lies in [0, 1]. Processed submissions cannot exceed the total. Answer scores
  cannot exceed the question maximum; submission scores require a sufficient
  `max_score`. Lowering question maxima cannot invalidate existing answer scores.
- `updated_at` is set by triggers. Submission answers default to `needs_review`;
  the grading workflow requires explicit teacher decisions for uncertain answers.
- An external grading batch may start with `worksheet_id = null`, accepting
  uploaded submission pages before an answer key exists. Link an `uploaded`
  worksheet before inserting answers. Once linked, the worksheet is fixed.
- `generated` means application-authored, including manually created worksheets
  and teacher-accepted AI suggestions; `uploaded` means externally supplied.
  Submissions and AI runs keep their status
  text extensible in the schema; workflow guards protect grading transitions.
  Other statuses/types have the constrained sets requested in prompt 2.

## Worksheet editor transactions

`save_teacher_worksheet` validates the complete structured document and derives
`teacher_id` from `auth.uid()`. It uses invoker privileges, existing RLS, an empty
search path and an explicit execute grant for `authenticated`; anonymous callers
cannot run it. A save creates or updates the parent, ordered `questions` and
separate `answer_keys` in one transaction. Retained questions and keys preserve
their UUIDs; removed questions cascade to their keys. Failed validation, identity
collisions or database constraints roll back the entire save.

Drafts can contain blank prompts and incomplete answers. Marking a worksheet
`ready` requires at least one question, nonblank prompts, usable multiple-choice
options and selected correct options, and a nonblank short answer. Numeric
questions store a finite expected value and nonnegative tolerance; open responses
may have an optional example answer and rubric. Type-specific options, tolerance,
difficulty and generation context live in question metadata with `editor_version`
set to `1`; correct answers and rubrics live in the answer-key table. Content is
plain structured text rather than HTML.

Updates require the precise previously read `updated_at` timestamp. The RPC locks
the parent row and rejects a stale revision with `PT412`; a second tab cannot
silently overwrite the first tab's saved work. A grading-batch attachment takes a
conflicting share lock on its worksheet. Save/delete then check grading references
under the parent lock, protecting history even when attachment and editing happen
concurrently. Referenced worksheets are read-only in this editor, with edit and
delete returning `PT409`. `delete_teacher_worksheet` checks the authenticated owner
and references before deleting; the Server Action additionally requires explicit
confirmation. Auth-user deletion remains a separate account-level cascade.

The current editor handles application-authored worksheets in `draft` or `ready`
with a base question sequence (`variant_id = null`) and independent additional
variants. It does not convert uploaded papers. Unsupported legacy metadata or
variant content fails closed instead of being rewritten. External student papers
remain independently supported by the existing grading schema. Future workflows
must add explicit adapters and their own validation before exposing other formats.

## AI reservations and audit records

AI generation is a suggestion: generating or regenerating does not persist a
worksheet. Teachers edit and explicitly save through the same worksheet domain
and transactional RPC as manual creation. AI grading remains outside this scope.

`reserve_ai_run` serializes each teacher's reservations with a profile-row lock.
It validates the model, purpose and SHA-256 input hash, then creates a `running`
audit record and appends to `private.ai_request_reservations` in one transaction.
The ledger has RLS, own-row SELECT/INSERT policies and an INSERT grant limited to
`id` and `teacher_id`. Its timestamp is set by the database; authenticated callers
cannot backdate, update or delete reservations. The private schema is not exposed
through the Data API. Ledger records cascade when the account is deleted.

The quota is 20 reservations per teacher in a rolling hour, including failed
provider attempts. It is counted from this append-only ledger, so editing or
deleting owned `ai_runs` audit rows cannot reset the cost quota. The additional
180-second `running` check on the audit table prevents ordinary duplicate requests
across tabs. That check is an advisory in-flight guard, because owned audit rows
remain editable; it is not the security boundary for the hourly quota.

Audit records contain model, purpose, input hash, result/error metadata and duration,
never provider keys. Server-side code finishes the owned audit record after success
or failure. Provider errors or logging failures are surfaced safely instead of
silently reporting success.

## Deletion and consistency

Deleting a class clears only `grading_batches.class_id`, preserving the batch and
its teacher. Deleting a worksheet with grading references is rejected; archive it
instead. Parent deletion cascades to owned children. Deleting an Auth user
cascades through the profile to all domain rows, including grading history.
Cross-branch foreign keys are initially deferred so complete account deletion
can finish before referential checks at transaction commit; they still reject
invalid committed links. Server Actions should use transactions for operations
that must succeed together.

Database deletion does **not** delete stored blobs. Future account deletion must
remove files using the Storage API, then delete the Auth user; do not issue SQL
DELETE against Storage metadata. Existing access tokens can outlive a deleted
account; file policies additionally require an existing profile, denying access
to any leftover file metadata.

## Private Storage

`worksheet-files` and `submission-files` have `public = false`. Object keys follow
`<teacher UUID>/<resource UUID>/<filename>`. SELECT/INSERT/UPDATE/DELETE policies
require the authenticated teacher's UUID as the first folder. UPDATE checks both
old and new paths, and INSERT + SELECT + UPDATE allow future upsert operations.
Submission page/crop paths must also begin with their teacher UUID.

Restrictive guards protect these buckets if another feature later adds a broader
permissive policy: authenticated users still need their own prefix and existing
profile; anonymous access remains denied. Other bucket policies are unaffected.
Ownership depends on paths rather than `owner_id`, allowing future server-created
files in a teacher's folder. Service-role clients bypass RLS and must remain
server-only. Share access only with authorized Storage API requests or short-lived
signed URLs created after verifying the teacher; public URLs are inappropriate.

## Validation

Run lint, TypeScript checks and the production build after changes. The automated
SQL/PGlite suites were removed with the test directories at the user's request.
`src/types/database.ts` is generated from the live schema and used by every
Supabase client; regenerate it after migrations that change the public contract.
Prompts 0–14 are implemented. Further prompts require separate user review and
an explicit request to continue. Remaining external advisories are in the root
README.

## Worksheet variants and printing

The base questions retain `variant_id = NULL` for compatibility with saved work
and the shared AI/manual question model. They form Variant 1. Additional copies
use `worksheet_variants`, indexed from 1, with unique labels and independent
question/option identities. The editor supports 1–10 variants, up to 100 questions
per variant and 300 in total. Existing payload size bounds also remain in force.

`save_teacher_worksheet` validates every variant and answer key before any write,
then saves the full document atomically with ownership and revision checks.
Removing a variant deletes its questions and keys; retained identities remain stable.
Question identities cannot transfer between variants. Worksheets linked to grading
batches remain read-only, preserving the grading context. No RLS policies or
privileged service clients were added for this feature.

Printing uses one ownership-scoped relational select for a consistent snapshot,
without joining `answer_keys`. Only whitelisted student-facing fields reach the
renderer. PDFs are returned directly with private/no-store headers; they are not
stored publicly. The optional QR feature is omitted. No student identity or
dependency on generated papers is introduced into the grading workflow.

## Grading uploads

`manage_grading_upload` is a SECURITY INVOKER RPC with an empty search path and
authenticated-only execute grants. It derives ownership from auth.uid(), locks
the owned batch, verifies its revision and prevents page mutations after grading
has started or answers exist. Existing parent/FK/worksheet locks remain in force.
External batches keep worksheet_id NULL and do not create artificial worksheets.

The RPC appends one submission plus one pending page per generated UUID, saves a
complete permutation of submission upload_index values, removes pages with their
submission, or marks a server-normalized JPEG stored after checking the exact
private Storage object. At most 100 submissions can be reserved by this workflow.
Order uniqueness is deferred so swapping positions is atomic. Legacy submissions
have nullable upload_index; existing page rows default to stored for compatibility.

The finish operation recalculates total_submissions and permits ready only when
every submission has exactly one stored page with dimensions and an existing
private blob. It never invokes AI or creates submission_answers. New uploads,
rotation, deletion or reordering return the batch to uploading for confirmation.
Stored rotations use new UUID object names; application cleanup uses Storage API,
never SQL deletion of storage.objects. A lost commit acknowledgement triggers a
re-read before any cleanup, so committed blobs are preserved.

## Batch answer key review

`grading_batches.answer_key_worksheet_id` references a unique, teacher-owned
uploaded worksheet context. `worksheet_id` keeps the immutable optional source.
There are no duplicate key tables. SECURITY INVOKER `save_grading_answer_key`
locks the owned batch, checks its revision/readiness, rejects recognition/results
or assigned submission variants, and reuses the full worksheet transaction to
save freshly identified questions/options/variants. Context, source, review marks
and explicit confirmation are attached atomically. Previous snapshots are removed
only after replacing the link. Direct writes to attached snapshots are rejected.

Uncertain fields persist as bounded question-ID marks with explicit teacher
acknowledgements. Draft keys cannot be used to insert submission_answers.
Confirmation requires a ready key and reviewed uncertainties; application Zod
validation checks all typed answers. Uploaded-page edits clear confirmation.
Processing/results lock replacement. Submission/answer context validation uses
the snapshot, with original-worksheet fallback for legacy batches. Source keys
are never modified. Batch deletion and account cascades clean up the context.
Its unique index covers the FK/ownership lookup. Existing RLS and private Storage
remain in force; contexts are excluded from worksheet/dashboard lists.

`reserve_ai_run` supports answer_key_parsing with the existing private hourly
quota. Document images/answer text never enter AI audit metadata or public Storage.

## Preliminary grading and teacher review

Five authenticated-only SECURITY INVOKER RPCs claim, complete, fail, review and
finalize grading. They derive ownership from auth.uid() and use an empty search
path. Lock order is batch, submission, answer; external AI runs outside transactions.
Claims check confirmed keys, selected variants, stored pages/objects and two live
jobs per batch. UUID attempts expire after 180 seconds. Completion validates the
exact question set, maxima, confidence and review policy, atomically stores results
and recalculates progress. Expired workers cannot overwrite reclaimed attempts.
Completion acknowledgement is idempotent; failure only affects its own attempt.

Started batches retain grading_started_at. Workflow triggers reject direct edits
of submissions, original page metadata and results. A private transaction-local
workflow marker is set inside scoped RPCs, never accepted from browser input.
Account/batch cascades remain supported. Teacher reviews require the answer
updated_at revision and enforce score bounds. Unreadable explicitly assigns zero.
Finalization refuses unfinished jobs, missing answers or needs_review; PostgreSQL
sums stored final scores and immutable question maxima. No client total is accepted.

The private append-only ledger allows submission_grading two recent running audits
and up to 60 calls per hour; other purposes retain 20. Provider quotas are independent.

## Completed-batch analytics

Analytics reads the existing grading tables through the authenticated SSR client.
Ownership is checked before reading child rows, with RLS still enforced. Final
scores, selected variants and the immutable answer-key snapshot are authoritative.
Paged reads use stable ordering and exact counts, advancing by the actual rows
returned. Explicit bounds are 1000 submissions and 100000 answers; exceeding
them produces an error instead of partial analytics. The current upload workflow
already limits batches to 100 submissions.

Migration `20261011154610_grading_analytics_ai_summary.sql` adds the
`grading_summary` purpose to `reserve_ai_run`, preserving SECURITY INVOKER,
authenticated-only execution, the private append-only reservation ledger and
the shared non-grading allowance of 20 calls per hour. No new analytics tables,
views, public images or privileged clients are introduced. AI audit rows contain
metadata only; suggestions are not persisted or applied automatically.

## Debate topic suggestions

Migration `20261013104958_debate_topics_ai.sql` adds `debate_topics` to the existing
reservation function's accepted purposes. It preserves caller ownership, invoker
security, explicit authenticated-only grants, the profile lock, single concurrent
non-grading request and shared 20-per-hour private quota. There are no debate
tables, changes to grading data or new privileged clients. Generated topics and
English phrases are transient suggestions, with metadata-only AI audit rows.

## Mobile Batch Scan

Prompt 13 adds no schema, policies, buckets or privileged services. Captures use
the same `manage_grading_upload` append/store/finish transaction and owned binary
JPEG route as ordinary files. A stable capture UUID identifies the normal
submission/page; IndexedDB stores normalized pending blobs before network work.
Refreshing authoritative owned batch state before reservation recovers lost
append/store acknowledgements and current revisions. Upload success removes the
local blob. Stored images stay in `submission-files` behind existing private routes.
Camera requests do not invoke AI or change grading/answer-key data.

## Production hardening

Migration `20261013121214_production_hardening.sql` protects terminal workflow states,
definitive answer reviews and submission totals before grading starts, as well as
afterwards. Direct batch counter updates are rejected. The validated upload RPC
recomputes the count under its batch lock; claim and finalization also derive counts
from actual submissions rather than earlier client-controlled values. Guard functions
have no API execute grant. All replacement RPCs remain SECURITY INVOKER with RLS.

The private buckets now enforce file-size and MIME limits: 6 MiB/JPEG for submission
pages and 30 MiB/PDF/JPEG/PNG for worksheet files. Decoder/streamed byte limits in
the authenticated application are still required. Bucket MIME rules do not validate
the bytes of an uploaded image. No table columns or RPC signatures changed.

Remaining external advisories are recorded in the root README. The hosted
adversarial probe was rolled back completely.

## Teacher settings

Settings are validated with Zod and database constraints. `save_teacher_settings`
locks the owned profile, checks the settings revision and saves profile fields and
preferences atomically. The dashboard and header read the persisted display name.
Grading preferences are copied to a batch on first claim. The completion RPC uses
that immutable snapshot for confidence and optional AI short-answer acceptance.
Unreadable/ambiguous/blank responses remain manual. Open responses can be auto
accepted only with the explicit fast/custom gate and confirmed criteria. Legacy
started batches retain their original rules; account edits never rewrite them.

`save_batch_grade_conversion` changes only an owned batch's diary conversion with
a revision check. It never changes final scores. `save_worksheet_with_library`
wraps worksheet persistence and optional library entries in one transaction;
only teacher-saved worksheets and accepted questions enter the library.

Completed-image cleanup uses the authenticated Storage API and an insert-only
marker, preserving all grading rows. Retention is measured from `completed_at`.
It runs on authenticated site entry or an explicit settings action, not on a
background schedule. Original/crop routes retain ownership checks and return a
constant placeholder after acknowledged removal. Unfinished batches are excluded.

Notifications are owned rows created by grading transitions. Review decisions
update the outstanding count and mark a resolved notification read. Lists are
limited to the latest 20; unread counts use an independent exact count.
All added RPCs/triggers use invoker security and an empty search path.

The generated TypeScript RPC argument contract is corrected for PostgreSQL's
nullable `p_variant` and `p_student_name`; preserve these when regenerating types.

## Per-batch autonomy and whole-paper review

Migrations 20261014081036, 20261014081918 and 20261014084943 add validated
`autonomy_config`, `configure_grading_autonomy`, `claim_grading_submission_v2`
and atomic `review_grading_answers`. Acknowledged per-batch rules require an
unstarted ready batch and exact revision. The first v2 claim refuses missing
configuration and copies it into the existing immutable grading snapshot.
The older claim RPC remains compatible with deployed clients and defaults open
auto acceptance off. Diary conversion still snapshots independently.

Completion requires a live exact attempt and the full variant question set.
Open auto acceptance requires both AI flags, enabled AI/open gates and nonempty
confirmed criteria. Blank unflagged payloads, unsafe flags and scores below the
confidence gate fail closed. Group review locks batch/submission/selected answers,
checks all revisions before writes, rejects duplicates and foreign/unsafe rows,
and checks the exact current eligible set for whole-paper confirmation. It reuses
the single-answer review workflow in one transaction, retaining notification
counts and teacher overrides. Finalization stays explicit and server-derived.

Rollback probes covered all three presets, acknowledgement/revision/ownership
checks, two-job concurrency, frozen settings, unsafe/blank auto rejection, atomic
stale groups, duplicates, whole-selection changes, overrides and finalization.
Browser verification used synthetic fixtures only. No auth bypass or new secrets.

## Automatic scanning, multi-page works and teacher calibration

Migrations `20261014163959`, `20261014170949` and `20261014173019` add owned
capture metadata, private preview paths, mandatory scan review and per-batch
calibration. Existing pages remain compatible. Up to 100 pages can be captured;
`confirm_scan_review` groups them into works of up to 10 pages with contiguous
page indexes. The transaction checks the batch revision, every current image
version and live Storage objects before changing any rows. Page IDs and Storage
paths stay stable during grouping. Reparenting is forbidden outside this owned,
unstarted upload transaction. Removing a page reindexes its remaining siblings.

Captures are persisted to batch-scoped IndexedDB before background upload.
Stable upload tokens recover lost acknowledgements without silently duplicating
or replacing images. Server Sharp creates normalized JPEGs and 640px previews
once. Exact content hashes and perceptual hashes produce duplicate warnings;
similar legitimate works are never silently discarded. Original and preview
routes verify ownership and image-removal markers before using a bounded private
60-second server cache. Browser responses remain private/no-store. Deletion and
retention remove both images through the Storage API.

Student recognition processes one image per request so source-page identity is
assigned by the server. Continuations are merged and graded as one answer, never
by adding partial page scores. Mixed identities and conflicting short/numeric
answers remain manual. The existing exact-attempt lease and private quota cover
the whole work; provider limits can require an explicit retry. No capture, scan
review, grouping or key confirmation starts recognition automatically.

`configure_grading_calibration` selects 3–5 owned works (all works if fewer than
three). Until a profile is approved, claims for remaining works are blocked and
every sample answer requires a teacher decision even in fast mode.
`save_calibration_feedback` atomically validates answer revisions, saves the
decision and records its explanation; changed scores require an explanation.
Feedback rows have owned RLS and guarded writes. Rule generation receives only
question criteria, proposed/final points and explicit teacher explanations, with
no student names, images or transcriptions. `grading_calibration` shares the
existing private non-grading quota; proposals are transient.

`approve_grading_calibration` requires all sample answers to be teacher-reviewed,
checks the batch revision and whitelists question IDs before freezing the
validated profile. Rules may refine scoring within existing maxima but never
alter keys or multiple-choice scores. Approval does not start AI. Remaining
works use the approved rules only after a separate teacher launch. Sample scores
are retained, all preliminary results remain overridable and finalization remains
explicit. Types preserve nullable `p_variant`, `p_student_name` and calibration
feedback `p_score` when regenerated.
