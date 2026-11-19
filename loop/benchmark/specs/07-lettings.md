# 07-lettings

Difficulty: Super complex + ledger

## Request (given to the builder)

Build software for my lettings agency: properties and flats, tenancies (start, end, rent, deposit), automatic monthly rent charges, payments, late fees, and a tenant portal where tenants see their balance and report repairs. Show occupancy, rent collected and who's in arrears. Seed three years of history.

## Acceptance checks (judge only)

- No two tenancies overlap on the same flat.
- Rent is charged monthly, prorated for part months; running the billing twice doesn't double-charge.
- A late fee is charged at most once per month and only for late rent (an unpaid fee doesn't trigger another fee).
- Tenants see only their own balance and repairs.
- Arrears and occupancy figures match the ledger and tenancies.
