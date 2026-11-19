# 01-habits

Difficulty: Simple

## Request (given to the builder)

Build me a habit tracker. I sign in, add habits (like "Read 20 pages" or "Run"), tick them off each day, and see my current streak, best streak and a heatmap of the last 12 weeks for each habit. Fill it with about a year of realistic history for a demo account so it doesn't look empty.

## Acceptance checks (judge only)

- Ticking a habit twice on the same day counts once; un-ticking removes it.
- Streak: consecutive days up to today (or up to yesterday if today isn't done yet); a missed day resets it.
- You can't tick days in the future.
- A user never sees another user's habits (try with a second account).
