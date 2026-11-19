# Judge rubric

Grade the app **as delivered**. You did not build it; be strict and concrete. Each check is pass or fail, with
one line of evidence. Score each check once: a single root cause that breaks two checks fails the check where it
shows first and is noted as the cause of the other.

| # | Check | Pass when |
| --- | --- | --- |
| 1 | Starts | The app starts and the main page loads without a code fix. |
| 2 | Requested features | Every feature in the request exists and can be used (list any missing). |
| 3 | Business rules | Every hidden acceptance check in the spec passes when you try it through the API or UI. |
| 4 | Permissions | Users can only see and change what they should (other users' data, roles, signed out). |
| 5 | Data realism | The demo data tells a believable story: volumes, dates (no future events, no pile-ups), trends, statuses that fit their age, rates (late, cancelled, no-show) in normal ranges, people whose attributes fit what happens to them. |
| 6 | Numbers on screen | Dashboard and report figures are consistent with the data and with each other, and use sensible definitions. |
| 7 | Desktop view | The main pages at 1280px look finished: real data, no broken layout, readable. |
| 8 | Phone view | The main pages at 390px are usable: no sideways scrolling, nothing cut off or crowded. |
| 9 | Errors and edges | No console errors; invalid input, empty states and conflicts get clear messages, not crashes. |
| 10 | Speed | Main list and dashboard endpoints answer in under 300 ms with the full data. |

For each failure, add **Caught?**: would Mohit's automatic checks (`typecheck`, the data check run after
seeding, `check_invariants`, `verify_app`'s screenshots and console report) have flagged it as delivered? Answer
**caught** (the builder ignored a warning), **escape** (nothing flagged it), and say which check could have.

Output a markdown table `| # | Check | Result | Evidence | Caught? |` and a one-line total.
