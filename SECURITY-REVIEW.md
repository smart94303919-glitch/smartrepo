# Smart OMR Security Review

**Review date:** 2026-10-22
**Scope:** Root Ionic/Angular application, FastAPI backend, and checked-in Supabase integration. The live Supabase schema and policies were not available for verification.

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | [backend/api_server.py](./backend/api_server.py) | 1209-1242, 1262-1270 | Results and spreadsheet export endpoints return student scores by sheet ID without authenticating the caller or checking professor ownership. | 9/10 |
| 2 | 🟠 HIGH | [backend/api_server.py](./backend/api_server.py) | 196-212, 534, 757-807 | Score submission trusts caller-supplied `prof_id`, student ID, sheet ID, score, and percentage. The sheet ownership check verifies only the supplied professor/sheet pair; it does not establish the caller's identity. | 9/10 |
| 3 | 🟠 HIGH | [src/app/services/supabase.service.ts](./src/app/services/supabase.service.ts), [src/app/searchstud/searchstud.page.ts](./src/app/searchstud/searchstud.page.ts) | 1876-1923; 40-41, 92 | Student search reads the global student table and deletion filters by student ID, not professor ownership. Cross-professor exposure or deletion is possible if deployed RLS policies do not block it; those policies are not checked into the repository. | 8/10 |
| 4 | 🟡 MEDIUM | [src/app/services/supabase.service.ts](./src/app/services/supabase.service.ts) | 187, 221-234 | Professor passwords are stored as plaintext and login compares plaintext values. A database or backup exposure would disclose reusable credentials. | 10/10 |

## Recommended remediation

1. Require verified authentication for every backend operation that reads or changes student grades. Derive professor identity from the verified token, not a request field.
2. Restrict grade-result and export reads to sheets owned by the authenticated professor.
3. Calculate score and percentage on a trusted server path, verify the student is enrolled for the authenticated professor's sheet, and enforce duplicate prevention in the database.
4. Replace the custom password table/login flow with Supabase Auth or an equivalent authentication service using modern password hashing. Do not expose password columns through client-readable queries.
5. Add and test RLS policies for every table exposed through the Supabase anon client. Include cross-professor negative tests for reads, inserts, updates, and deletes.

## Review notes

- Archive retrieval filters by `prof_id`, and archive deletion during restore includes both archive ID and professor ID. These client-provided values are not a substitute for server-verified authorization.
- The OMR question form validates an integer question count from 1 to 100. The backend request model and Python sheet configuration currently enforce only a positive value; enforce the upper bound server-side as well.
- The frontend uses a Supabase anon key. No current SQL migrations or RLS policy definitions for the application tables were found in the repository, so deployed database enforcement remains unverified.
