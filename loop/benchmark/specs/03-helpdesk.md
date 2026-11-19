# 03-helpdesk

Difficulty: Complex

## Request (given to the builder)

Build a helpdesk for my software company. Customers email in (just simulate it with a 'new ticket' form), agents see a queue with priorities and SLAs, reply, assign, and close tickets. Show each agent's open load and an overview of response times and backlog. Fill it with a year of realistic tickets and conversations.

## Acceptance checks (judge only)

- SLA: first response due by priority (e.g. urgent 1 h, normal 8 h); overdue tickets stand out and the count matches.
- Closed tickets can be reopened by a customer reply; assignment only to agents.
- Customers see only their own tickets.
- Replies in the seed match the ticket's subject (no generic text unrelated to the problem).
- Response-time figures on the overview match the data (spot-check one agent).
