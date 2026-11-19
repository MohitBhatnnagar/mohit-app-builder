# Mohit benchmark

The first seven test batches built a new, harder app each time, with the same agent building and grading, and
counted every mistake that Mohit's own checks later caught as a failure. That measured the AI's first draft on a
moving target, not what Mohit delivers. This benchmark replaces it.

## Method

1. **Fixed specs.** `specs/` holds 8 app requests of mixed difficulty, written the way a user would ask. Each spec
   also lists hidden acceptance checks that only the judge sees. The set does not change between runs, so runs are
   comparable; when Mohit changes, re-run the same set.
2. **Fresh builder.** Each spec is built by a new agent with no history: it gets the request and Mohit's tools
   (through `scripts/bridge.ts`), reads the guide, and works until it would hand the app to the user.
3. **Independent judge.** A different new agent grades the delivered app against `RUBRIC.md` and the spec's
   hidden checks, by using it: API calls, screenshots at desktop and phone width, and reading the data.
4. **Results** go to `results/<date>.md`: per spec, the 10 checks, and for every failure whether Mohit's automatic
   checks could have caught it.

## What we measure

| Metric | Meaning | Target |
| --- | --- | --- |
| **Delivered quality** | Share of the judge's checks that pass on the app as handed over | ≥ 95% |
| **Escapes** | Failures the judge finds that Mohit's automatic checks didn't flag | ≤ 5% |
| First verify | Share of `verify_app` sections passing on the builder's first call (how good the first draft is) | tracked, not targeted |

An escape is a lead for Mohit: either a new automatic check, a better default, or a building block that makes the
mistake impossible. Guide text alone is not a fix: batches 1–7 showed written advice rarely prevents a repeat.
