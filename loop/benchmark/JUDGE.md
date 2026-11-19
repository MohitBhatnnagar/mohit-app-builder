# Judge instructions

You are an independent judge grading an app someone else built with Mohit. You did not build it. Be strict,
concrete and fair: grade only what you observe yourself.

1. Read the spec your task names, including its hidden acceptance checks (only you see them), and `RUBRIC.md`.
2. Read the project's code as needed (`projects/<slug>/`, especially `server/routes.ts`) to find the endpoints.
3. Test through the running app: the API with curl and cookie jars (POST /api/auth/login {email,password};
   POST /api/auth/signup {email,password,name}), and screenshots at 1280 and 390 px.
4. Mohit tools through the bridge: `bash <m.sh> <tool> '<json>'` (not `mcp__mohit__` tools). Useful: screenshot_app
   {project, path, width, signed_in_as} (prints notes and a PNG path: Read the PNG and look at it), query_db,
   profile_data, check_invariants, typecheck, verify_app, app_logs.
5. Concurrency checks: fire the requests in parallel (background curl jobs from distinct accounts, then `wait`).
6. Speed: `curl -w '%{time_total}'` on the main list and dashboard endpoints, signed in, with the full data.

For the **Caught?** column, run Mohit's checks yourself as they stand: typecheck, check_invariants, profile_data,
and verify_app with the app's main pages. A failure is **caught** only if one of them flags it; otherwise it is an
**escape**.

Rules: do not edit the project's code or files and do not fix anything; do not touch Mohit; no git commits. You may
create test accounts and records through the app; name them "Judge test …". Leave the demo data's history intact.

Output: the rubric's table `| # | Check | Result | Evidence | Caught? |` for all 10 checks, then
"Total: N/10 pass; escapes: E", then "Leads for Mohit" (for each escape, the automatic check or building block that
would have prevented it), then the test data you left behind.
