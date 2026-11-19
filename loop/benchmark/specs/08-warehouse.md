# 08-warehouse

Difficulty: Ultimately complex + inventory

## Request (given to the builder)

Build a warehouse system for my online shop: products in bin locations, purchase orders from suppliers that we receive and put away, customer orders that get allocated stock, picked (in walking order), packed and shipped, plus stock counts. Show me what needs reordering and what's late. Seed a year of operations.

## Acceptance checks (judge only)

- Stock never goes negative; allocation reserves stock so two orders can't take the same units.
- Every unit is explained by the movement history (sum of moves = stock on hand, per product).
- Receiving an out-of-stock product works and goes to its usual bin.
- "Needs reordering" counts what's already on order; "late" means past its ship-by, not just old.
- Short picks are handled (the order isn't marked complete while short).
