# 04-invoicing

Difficulty: Complex + money

## Request (given to the builder)

Build invoicing for my freelance design studio: clients, invoices with line items and VAT, sending invoices (email), recording part payments, overdue tracking with reminders, and PDF invoices. Give me a dashboard of what's owed and aged debt. Seed two years of realistic invoicing.

## Acceptance checks (judge only)

- Invoice total = sum of lines + VAT, to the penny; a payment can't exceed the amount outstanding.
- Status follows payments: draft → sent → part-paid → paid; overdue when past due with money outstanding.
- The PDF opens and shows the same totals.
- The aged-debt buckets add up to the total owed.
- No reminders for paid invoices; one client can't see another's invoices if there's a client view.
