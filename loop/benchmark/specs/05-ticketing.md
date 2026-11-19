# 05-ticketing

Difficulty: Super complex + concurrency

## Request (given to the builder)

Build ticket sales for a music venue: public event pages with ticket types and prices, checkout that holds tickets for a few minutes, order confirmation with ticket codes, refunds before a cutoff, and a door-scanning page for staff. Organisers need sales per event. Seed a year of events and sales.

## Acceptance checks (judge only)

- Never oversells: 15 buyers racing for the last 5 tickets get 5.
- Expired holds release their tickets; a hold can't be checked out twice.
- A ticket scans once; a second scan, a refunded ticket or another event's ticket is refused.
- Refunds after the cutoff are refused for buyers.
- Sales per event on the organiser view match the tickets sold.
