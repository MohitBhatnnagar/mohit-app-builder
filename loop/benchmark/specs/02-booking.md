# 02-booking

Difficulty: Complex

## Request (given to the builder)

I run a small barbershop with 3 barbers. Build a booking site: customers pick a service (with a length and price), a barber and a free time slot, and book with their name and email. Barbers have working hours. I need a staff view of the day's bookings, the ability to cancel, and a simple dashboard of bookings and revenue. Seed several months of realistic bookings.

## Acceptance checks (judge only)

- No double booking of a barber, including overlapping services of different lengths.
- No bookings in the past, outside the barber's working hours, or overlapping lunch if hours define it.
- Two customers booking the same slot at the same time: exactly one succeeds.
- Cancelling frees the slot.
- Customers can't see other customers' bookings; staff views need staff sign-in.
