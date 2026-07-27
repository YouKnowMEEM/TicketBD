# TicketBD — Changes in this pass

## 1. Database: FareStructure removed

Fare is now `Seat.price` — a flat fare per (train, class), set at seat-creation time,
instead of a separate table keyed by route segment.

**Trade-off to know about:** FareStructure could price the *same* train differently
depending on which two stations you travelled between (distance-based fare).
`Seat.price` can't do that — it's one price per train+class, full route only. If you
ever need distance-based fares again, you'll need a table keyed by
`(train_id, start_station_id, end_station_id, class)` again — there's no way to model
that as a single flat attribute on Seat. Given you explicitly wanted FareStructure gone,
this is the honest trade you're making.

**How to apply:**
- Existing database → run `db/migration_remove_farestructure.sql`
- Fresh install → use `db/ticketbd_schema.sql`, then `db/seed_routes_and_stations.sql`,
  then your seat-population procedures, then `db/seed_fares.sql`

## 2. Real authentication (JWT)

Previously "logged in" was just React state — anyone could hit
`GET /api/user/2304079` or `GET /api/my-tickets/2304079` for **any** student ID and
read their profile/tickets, or cancel their tickets, with zero login required.

Now:
- `/api/login` issues a signed JWT (7-day expiry).
- Every route that touches personal data (`/api/user/:id`, `/api/my-tickets/:id`,
  `/api/checkout`, `/api/cancel-ticket`) requires `Authorization: Bearer <token>` and
  checks the token's identity matches the user being acted on.
- The frontend stores the token in `localStorage` and restores your session on page
  refresh (previously refreshing the page logged you out).
- **You must add `JWT_SECRET=<a long random string>` to your backend `.env` file** —
  the server refuses to start without it.
- `npm install jsonwebtoken` in your backend folder.

## 3. Server-authoritative pricing

Checkout previously trusted a `price` field sent from the browser for each seat. That's
directly editable by anyone with dev tools open. Checkout now looks up
`Seat.price` server-side inside the transaction and ignores anything the client sends.

## 4. The refund/resale logic is now real

Per your spec: cancelling a ticket **never pays out immediately**. It opens a
`RefundRequest` (`status = 'PENDING_RESALE'`). From there:

- **Someone else books that exact seat + journey date** → `/api/checkout` detects the
  pending refund request, writes a `ResaleSegment` row, and marks the refund
  `RESOLD_FULL_REFUND` with `refunded_amount` = the *original* passenger's full
  `price_paid`.
- **The journey date passes with nobody rebooking it** → the next time that user loads
  their tickets, the server lazily settles the request as `EXPIRED_PARTIAL_REFUND`,
  using the `potential_partial_refund` your existing cancellation-fee schedule already
  calculates. (There's no cron job running server-side, so this is checked opportunistically
  on read — fine for a project like this; a real deployment would want a scheduled job instead.)

The ticket cards in the profile page now show which of the three states a cancelled
ticket is in, instead of just "refund pending" forever.

## 5. Other fixes
- Student ID / mobile number inputs were `type="number"`, which silently strips
  leading zeros and lets scroll-wheel change the value. Switched to
  digit-filtered text inputs.
- Removed the hardcoded station-name fallback list in the frontend — it was a second,
  drifting source of truth alongside the database and could silently resolve a station
  to the wrong ID.
- Added a public `GET /api/verify-ticket/:transactionId` endpoint and wired it to the
  "Verify Ticket" nav link (previously a dead stub) — anyone can check a PNR's status
  without logging in.
- "Contact Us" now opens an actual modal instead of doing nothing.
- Added a working Logout button.
- Checkout now takes a row lock (`FOR UPDATE`) on the seat and re-checks it's not
  already booked inside the transaction, closing a race condition where two people
  selecting the same seat at the same moment could both succeed.

## 6. Visual pass

New identity: deep signal-green + amber (still reads as Bangladesh Railway, just
richer than flat `#008000`), Space Grotesk for headings, IBM Plex Mono for PNR/seat
codes. The one deliberate signature element: active tickets in "My Tickets" now
render as an actual **ticket stub** — a perforated tear-line with punch-holes between
the journey details and the action buttons, like a real paper coupon. Buttons, cards,
badges, and the seat map were pulled into `App.css` as reusable classes instead of
one-off inline styles, and loading spinners were added to search, seat-fetch, checkout,
and login so the app doesn't look frozen during requests. `App.css`'s old dead seat
rules (silently overridden before) and the unrelated Vite boilerplate in `index.css`
can both be deleted — they're superseded by the new stylesheet.

## Setup checklist
```bash
# backend
cd backend
npm install jsonwebtoken
echo 'JWT_SECRET=replace-with-a-long-random-string' >> .env

# database (pick ONE)
mysql -u root -p < ../db/migration_remove_farestructure.sql   # existing DB
# OR for a fresh DB:
mysql -u root -p < ../db/ticketbd_schema.sql
mysql -u root -p < ../db/seed_routes_and_stations.sql
# ... run your Seat-population procedures here ...
mysql -u root -p < ../db/seed_fares.sql

npm start
```

No frontend package changes needed — just drop in the new `App.jsx` and `App.css`.