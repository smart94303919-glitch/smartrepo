# Smart OMR System Requirements & Gap Analysis

**Review date:** 2026-10-22  
**Scope:** Root Ionic/Angular application, FastAPI/OpenCV backend, Supabase client usage, checked-in setup documentation, and available tests. The separate `omr_system v2.1` tree is treated as a legacy/parallel implementation, not assumed to be the production application.

## Executive assessment

The project demonstrates an end-to-end OMR workflow: professor-facing section and subject selection, student registration/import, PDF generation, image capture and batch scanning, answer-key management, score recording, and archive/restore/export. The OMR UI and processing pipeline have useful separation, and the frontend production build succeeds.

**Deployment readiness: not ready for production handling of real student records.** The most important blockers are unauthenticated backend grade/result operations, score writes that trust client-supplied professor identity and scores, no verifiable checked-in database schema or RLS policy set, and multi-step archive/restore/registration operations that are not transactional. The requested 1–100 question constraint is enforced in the UI but not at the API/model boundary.

This review could not inspect the live Supabase project. Conclusions about deployed constraints, indexes, and RLS are therefore explicitly marked **unverified**, not assumed absent in production.

## Status summary

| Area | Status | Evidence-based assessment |
|---|---|---|
| Feature coverage | Partial / present | Core OMR, student, dashboard, archive, and export flows exist. Workflow completion and recovery are not uniformly durable or atomic. |
| Modularity | Partial strength | OMR form, image picker, and results display are separated; API and Supabase access have service layers. `SupabaseService` still combines many unrelated domains and workflows. |
| Route and lifecycle state | Partial | Lazy routes and query parameters carry section/subject context; dashboard re-entry can retain stale values when parameters are cleared or incomplete. |
| Professor isolation | Failing / unverified | Frontend filters are present in some paths but cannot authorize requests. Backend endpoints have concrete access-control gaps; Supabase RLS is not verifiable from checked-in schema. |
| Question validation | Partial | The form checks integer 1–100; API `SheetConfigRequest` only requires a positive number and `SheetConfig` also has no upper bound. |
| Relational integrity | Unverified | The repository contains no production migration/schema definition for the named tables, foreign keys, unique constraints, or indexes. |
| Performance / scale | At risk | Several workflows perform multiple round trips and unpaginated fetches; OMR scan work is serialized per process and state/files are local to an instance. |
| Error handling / UX | Partial | OMR API normalizes HTTP errors and many actions show toasts/loading states. Some database errors become empty lists or log-only failures. |
| Build / tests | Build passes; tests weak | `npm run build` completed successfully. Most inspected frontend tests are component smoke tests; no tests were found under the root `backend` directory. |

## Architecture and workflow observations

### Frontend and module boundaries

- The main application is under `src/app`; the OMR module separates metadata form, image picker, and result display. `OmrApiService` is the documented HTTP boundary for the FastAPI service, while `SupabaseService` centralizes most PostgREST operations.
- Sections navigate to the student dashboard with `section`, `subject`, and `subjectId` query parameters. The dashboard re-fetches data from `ionViewWillEnter` and tracks an initialization key. This generally supports Ionic page reuse, but `initAndLoadData` only replaces the selected context when both subject ID and section are present. A navigation that removes either parameter may leave prior in-memory selections active. Reset or validate route context on each entry and subscribe to parameter changes if the page can remain mounted.
- Several components duplicate current-professor parsing from `localStorage`. This couples navigation/data calls to client-stored identity and creates inconsistent handling of missing or malformed session data. Replace with one typed session/auth service after moving identity authority to a verified backend session.
- The root repository also contains a separate `omr_system v2.1` copy. Its presence creates maintenance and release ambiguity: designate one supported implementation, document the other as archival, and prevent changes/tests from silently targeting the wrong tree.

### OMR generation, scanning, and grading

1. The template form loads professor-assigned sections/subjects and validates the form; it saves sheet metadata to Supabase, then requests PDF generation from FastAPI.
2. FastAPI persists sheet metadata/ownership, generates a PDF, writes configuration and output files locally, and returns the PDF.
3. A selected image is sent to `/grade-sheet`; the API loads a sheet config, runs OpenCV, and either returns an answer key or a grade result. Answer keys are persisted in Supabase. A graded score is sent separately to `/save-student-score` after UI confirmation.
4. Batch image processing is sequential and limited to a small UI batch. A semaphore serializes CPU-heavy scans within a process.

This decomposition is understandable, but metadata/ownership is written before PDF generation, so a generation failure can leave an assigned sheet without a usable PDF. Scan, score persistence, and UI confirmation are separate steps; the system needs explicit retry/idempotency semantics and a durable scan-job/result state if results must survive process restarts.

**Question-count gap:** the template form rejects non-integer values outside 1–100. The FastAPI request model only declares `gt=0`, and the shared Python `SheetConfig` checks positivity but not the 100-question ceiling. Enforce the same bound at API and domain-model boundaries, and validate scan overrides against saved metadata rather than trusting a caller-supplied count.

### Student dashboard, registration, and imports

- Dashboard reads are scoped in the service by professor-student association, section, and subject; this is useful application-level filtering, not an authorization boundary.
- The dashboard refreshes through Ionic lifecycle hooks and an in-memory `studentUpdated$` notification. This is appropriate for a single running app instance but does not synchronize changes made by another device or administrator without a refresh/realtime mechanism.
- Manual student registration and spreadsheet import support field checks and user feedback. Registration across multiple selected subjects is performed as repeated operations; an error partway through can leave partial enrollment. Imports also need an explicit row-level/whole-file transaction policy and a visible summary of successful, skipped, and failed rows.
- CSV text is parsed by splitting lines and commas directly. This does not correctly parse quoted CSV fields containing commas or newlines; use a standards-compliant parser and test representative exports.

### Archive, restore, and export

- Archive records are loaded by professor and enriched with related tables. Restore checks whether enrollment and professor-student links exist, recreates missing links, and then deletes the archive row. PDF export handles browser download and native Filesystem/Share flows and surfaces errors through toasts.
- Archive is not a single transaction: archive rows are inserted before enrollments are deleted; restore recreates enrollment and professor links before deleting the archive row. Partial failures can produce both archived and active records, or remove active enrollment while failing to record the archive consistently. Implement these as database RPC/functions with transaction semantics, uniqueness constraints, and idempotent retry behavior.
- Archive listing and export currently operate on the full set returned for a professor; there is no visible pagination/retention policy. Export uses client-side PDF construction, which is reasonable for modest volumes but can consume substantial mobile memory for large selections.

## Security and data-isolation findings

The following are concrete findings from the security review. Frontend `prof_id` filters and local-storage values must not be treated as proof of identity. The repository does not include the production RLS policy definitions, so database-side mitigation cannot be confirmed.

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | [backend/api_server.py](./backend/api_server.py) | 1209-1242, 1262-1270 | `/results/{sheet_id}` and spreadsheet export return grade records by sheet ID without authenticating the caller or checking sheet ownership. | 9/10 |
| 2 | 🟠 HIGH | [backend/api_server.py](./backend/api_server.py) | 196-212, 534, 757-807 | Score submission accepts caller-supplied `prof_id`, student, sheet, score, and percentage; ownership checks only validate the supplied professor/sheet pair and do not authenticate the requester. | 9/10 |
| 3 | 🟠 HIGH | [src/app/services/supabase.service.ts](./src/app/services/supabase.service.ts), [src/app/searchstud/searchstud.page.ts](./src/app/searchstud/searchstud.page.ts) | 1876-1923; 40-41, 92 | The global student search uses an unscoped student query, and student deletion filters by student ID rather than professor ownership. Risk depends on deployed RLS, which is not present in the repository for verification. | 8/10 |
| 4 | 🟡 MEDIUM | [src/app/services/supabase.service.ts](./src/app/services/supabase.service.ts) | 187 | Professor passwords are inserted as plaintext and login compares the plaintext database value directly. | 10/10 |

**Security strengths / boundaries observed:** archive retrieval filters by `prof_id`, and archive deletion during restore includes both archive ID and professor ID. Those client-supplied filters are not sufficient authorization by themselves. The frontend uses the Supabase anon key; no service-role key was found in the frontend environment file. The checked-in setup note itself recommends enabling RLS and replacing the custom authentication, but no current policy/migration was found to verify either recommendation was implemented.

## Database, integrity, and query optimization

- **Schema evidence is missing.** The only checked-in Supabase SQL example in `SUPABASE_SETUP.md` defines an old `professors` table, while the application uses names such as `professor_tbl`, `professor_login`, `prof_assignment`, `student_tbl`, `stud_section_subj`, `sheet_tbl`, `sheet_prof`, `sheet_anskey`, `student_score`, and `s_archive`. No migrations defining the current tables, foreign keys, uniqueness, check constraints, indexes, or RLS policies were found.
- Consequently, foreign-key integrity for `s_archive` relationships (student, school year, department, professor, section, subject), cascade behavior, orphan handling, and join cardinality cannot be verified. The project should keep versioned migrations and seed/reference data in source control.
- The app often uses multiple fetches to reconstruct relationships in application code. For example, assignment lists load assignments then fetch sections and subjects; dashboard student reads separately fetch professor links, enrollments, and student details; score dashboards load sheets, score rows, students, and assignment labels. These patterns are easy to follow but increase round trips and payload volume. Prefer explicit PostgREST relational selects or server-side views/RPCs where relationship metadata is reliable.
- Queries for student, score, and archive collections do not show pagination in the reviewed paths. Add stable ordering and cursor/range pagination, especially for archive, search, and grade history.
- Add/verify indexes on foreign-key and frequently filtered columns, including professor/section/subject assignment keys, `student_score(sheet_id, student_id)`, and archive ownership/date keys. Add unique constraints for sheet IDs, answer-key ownership, enrollment triples, and one-score-per-student/sheet where that matches policy. Confirm actual plans with `EXPLAIN (ANALYZE, BUFFERS)` against realistic volumes before deployment.
- `SupabaseService` has broad scope across authentication, professor assignment, student lifecycle, archive, sheet metadata, scores, and answer keys. Split along domain boundaries once transactional SQL ownership is established; keep UI components dependent on narrow typed methods rather than `any`-shaped table rows.

## Reliability, performance, and UX gaps

### Error visibility and state consistency

- `OmrApiService` normalizes backend errors and scan actions generally present loading overlays, alerts, or toasts. Archive PDF/native file errors are caught and surfaced.
- `getStudentsForSubject` catches failed section/student/enrollment queries and returns `[]`; the dashboard also turns student-load failures into an empty list. A failed query can therefore look like a valid empty class. Return an explicit result/error state and display a retryable error distinct from “no students.”
- Student registration's section loading logs failures without a visible message. Dashboard refresh logs errors, and its student-load branch does not set the page-level error text. Add consistent loading/empty/error states and preserve retry options.
- Make multi-step writes transactional and add idempotency keys to imports, generated sheets, scan submissions, and score writes. Enforce duplicate prevention at the database level to close concurrency races.

### Runtime and scaling

- OpenCV work is CPU-bound and serialized by a process-local semaphore. This protects a single process from concurrent scans but limits throughput; multiple processes/replicas each have separate semaphores.
- Results are cached in `IN_MEMORY_RESULTS`, and PDF/config/debug/answer-key artifacts use local filesystem paths. These are not shared durable stores and may disappear on restart or be inconsistent across horizontally scaled instances. Persist result/job state and store generated artifacts in durable object storage; retain local temporary files only for processing.
- The backend's maximum upload size and pixel count are bounded, which helps resource control. Add request timeouts, queue/backpressure, workload metrics, and explicit limits for batch size and output retention before scaling.
- The frontend production bundle builds, but the main chunk is approximately 632 kB raw. Inspect the complete build report and consider lazy-loading heavy PDF/spreadsheet libraries if initial load time is material on mobile networks.

## Recommended requirements and release gates

### P0 — required before real student data / production

1. Move professor login to Supabase Auth or an equivalent server-verified identity provider; never treat `localStorage` `prof_id` or request-body professor IDs as identity.
2. Require authentication and ownership checks for every grade, result, export, score write, answer-key write, archive, restore, and student operation. Derive professor identity from the verified token.
3. Enable and test RLS policies for every table exposed through the anon client. Check both positive access and cross-professor negative cases, including reads, inserts, updates, and deletes.
4. Stop accepting client-calculated score/percentage as authoritative; bind score writes to the authenticated professor, owned sheet, enrolled student, and server-calculated grading result.
5. Add current, versioned Supabase migrations with FK, unique, check, index, and RLS definitions. Document how to apply and roll back migrations.
6. Enforce `1 <= total_questions <= 100` on backend request models and domain configuration. Reject mismatched scan overrides and invalid metadata before processing.
7. Move archive/restore and multi-subject enrollment into transaction-safe database functions with idempotent behavior and failure-injection tests.

### P1 — required before scaling beyond a capstone demo

1. Persist scan jobs, answer-key/config snapshots, and score results in durable stores; make APIs stateless across restarts and replicas.
2. Add pagination, query limits, needed-column selection, and indexes; benchmark grade history, student search, and archive at expected class/institution sizes.
3. Add consistent page error/empty/loading states; test mobile filesystem permission denial, cancelled share sheets, offline retries, duplicate scans, and partial imports.
4. Fix CSV parsing and expose row-level import results. Define whether a batch is atomic or partially accepted.
5. Consolidate the supported codebase and remove/document the parallel legacy OMR tree.

### Capstone defense and deployment narrative

The strongest defensible architectural points are the modular OMR UI, shared Python geometry configuration for PDF/scanner alignment, use of question-specific sheet metadata, image upload bounds, and explicit confirmation/feedback in archive and registration flows. Be precise in the defense that professor filters are currently application-level and that RLS/schema constraints need production verification. Demonstrate question-count boundary tests at 1, 100, 0, 101, and non-integer inputs; show authorization tests for two professor accounts; and show archive/restore rollback behavior under injected database failures before claiming those requirements are complete.

## Validation performed

- `npm run build` — **passed**.
- The successful build emitted CommonJS optimization warnings from `canvg`, `jspdf`, and their dependencies; these are not build failures, but may limit bundler optimization.
- No source files were changed as part of this audit.
- No root `backend` Python test files were found by the source search. Existing frontend tests inspected for student registration are primarily component/smoke assertions; they do not establish the multi-account, database, OMR accuracy, or transaction guarantees above.
- Live Supabase schema, RLS policies, indexes, query plans, backup/retention configuration, and deployed API settings remain **unverified** and must be checked in the target environment.
