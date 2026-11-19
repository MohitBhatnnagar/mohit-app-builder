# 06-classes

Difficulty: Super complex + rules

## Request (given to the builder)

Build class booking for my yoga studio: a weekly timetable, members on either unlimited plans or class packs (credits), booking with a waitlist when classes are full, cancellation rules (late cancels lose the credit), and check-in at the front desk. Show me attendance and how full classes are. Seed a year of history.

## Acceptance checks (judge only)

- Class capacity is never exceeded; a cancellation promotes the first person on the waitlist automatically.
- Pack members spend one credit per confirmed booking; early cancellation refunds it, late cancellation doesn't.
- Waitlisting doesn't spend a credit until promoted.
- Members can't book overlapping classes.
- Fill rates and attendance on the dashboard match the bookings.
