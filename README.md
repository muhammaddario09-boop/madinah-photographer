# Al-Madani Photography — Madinah Reservation & Schedule Platform

A production-shaped photography booking platform for a photographer operating
in Madinah, Saudi Arabia: public marketing site + portfolio, an 8-step guest
booking flow, a real availability/slot engine with buffer time and
double-booking protection, and an admin dashboard (calendar, bookings,
availability manager).

---

## 1. Architecture Overview

```
Browser (public site, booking flow, admin panel)
        │  fetch() → JSON
        ▼
Express server (server.js)
        │
        ├── routes/public.js   → client-facing API (services, availability, bookings)
        ├── routes/admin.js    → admin API (dashboard, calendar, bookings, availability)
        │
        ├── lib/availabilityEngine.js  → slot generation, buffer time, override priority
        ├── lib/bookingEngine.js       → booking state machine, transactional double-booking guard
        ├── lib/notificationEngine.js  → provider-agnostic WhatsApp/Email/SMS message rendering
        ├── lib/timezone.js            → Asia/Riyadh as the single source of truth
        │
        ▼
SQLite (better-sqlite3, synchronous + transactional) — db/schema.sql
```

Static frontend: plain HTML/CSS/JS (no build step), so it deploys as-is
alongside the Express server. No client framework was introduced — the
booking flow is a small hand-rolled state machine (`public/js/booking.js`)
because the spec's step sequence (Service → Package → Date → Time → Details
→ Payment → Confirmation) maps directly onto it without extra tooling.

**Why SQLite, not Postgres/MySQL:** this environment has no external
database service to connect to, and better-sqlite3 is synchronous, which
makes the double-booking transaction in `bookingEngine.js` trivially atomic
(no async race window between check and insert). The schema is plain SQL
and portable — swapping the driver for `pg` and adjusting a handful of
`?`-placeholder calls is the only work needed to move to Postgres for a
real multi-instance deployment (see §12 Known Limitations).

---

## 2. Database Schema

See `db/schema.sql` for the full DDL with comments. Entities (spec §31):

`users, photographers, clients, services, packages, locations,
availability_rules, availability_overrides, bookings, booking_history,
payments, portfolio, notifications, activity_logs, settings`

Key relations (spec §32):
- `photographers` 1—N `availability_rules`, `availability_overrides`, `bookings`
- `services` 1—N `packages`
- `bookings` N—1 `client`, `photographer`, `service`, `package`, `location`; 1—N `payments`, `booking_history`

Double-booking is guarded two ways:
1. **Application-level check** inside a DB transaction
   (`isSlotStillAvailable` in `availabilityEngine.js`), re-run at the moment
   of insert — never trusts the frontend's cached slot list.
2. **`UNIQUE(photographer_id, date, start_time)`** constraint on `bookings`
   — if two requests somehow race past the check, the second INSERT throws
   and the whole transaction rolls back.

---

## 3. Folder Structure

```
madinah-photographer/
├── server.js                 Express entrypoint
├── db.js                     SQLite init + seed data
├── db/schema.sql              Full schema
├── lib/
│   ├── availabilityEngine.js  Slot generation, buffer, override priority
│   ├── bookingEngine.js       Booking state machine + double-booking guard
│   ├── notificationEngine.js  WhatsApp/Email/SMS message templates (provider seam)
│   └── timezone.js            Asia/Riyadh helpers
├── routes/
│   ├── public.js               /api/*        client-facing
│   └── admin.js                 /api/admin/*  admin-facing
└── public/
    ├── index.html, services.html, portfolio.html   marketing site
    ├── booking.html + js/booking.js                8-step reservation flow
    ├── my-booking.html                              client booking lookup + reschedule
    ├── admin/                                        dashboard, calendar, bookings, availability
    └── css/style.css, css/admin.css                  design tokens
```

---

## 4. Main Features Implemented

- Portfolio, services, and package browsing (packages fully admin-editable via DB, not hard-coded)
- 8-step guest booking flow (no account required, per spec §38)
- Slot-grid generation from opening/closing time + session duration + buffer
- Date-override priority over weekly recurring schedule
- Server-side, transactional double-booking protection
- Booking status state machine (PENDING → AWAITING_PAYMENT → CONFIRMED → COMPLETED / CANCELLED / NO_SHOW / RESCHEDULE_REQUESTED) with illegal-transition rejection
- Reschedule flow that re-validates availability and preserves history (never deletes old schedule)
- Admin dashboard KPIs, weekly calendar, booking list with status changes, weekly-schedule + date-override manager
- Notification records queued per booking (confirmation + 24h/3h reminders) with rendered WhatsApp-style message bodies — see §9 for what's stubbed
- User-friendly error messages everywhere; raw DB errors never reach the client

## 5. Booking Flow

```
HOME → PORTFOLIO → SERVICE → PACKAGE → DATE → TIME → CLIENT/PHOTOSHOOT DETAILS → PAYMENT (deposit) → CONFIRMATION
```
Guest booking; an account can be created after the fact (not built — see §12).

## 6. Availability Logic

1. Resolve the working window for a date: `availability_overrides` for that
   exact date wins if present; otherwise fall back to the weekly
   `availability_rules` for that day-of-week.
2. If the window is OFF (or missing), no slots.
3. Otherwise generate a fixed grid: `step = session_duration + buffer`,
   starting at open time, stopping once a session would run past close time.
4. Remove/mark any grid slot that overlaps an existing live booking
   **plus that booking's own buffer**, so custom-duration bookings still
   protect their neighbours even if they land off-grid (e.g. after a
   reschedule to a non-grid time).
5. At submission time, step 1–4 is re-run server-side inside a transaction
   before the INSERT — this is what actually prevents double booking, not
   the grid the client saw a few seconds earlier.

## 7. API Endpoints

**Public** (`/api/*`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/services` | List active services |
| GET | `/services/:slug` | Service detail + its packages |
| GET | `/locations` | List locations |
| GET | `/photographers` | List active photographers |
| GET | `/availability?photographerId&date&duration` | Slot list for one date |
| GET | `/availability/month?photographerId&year&month&duration` | Per-day AVAILABLE/LIMITED/BOOKED/OFF rollup for the calendar |
| POST | `/bookings` | Create a booking (server-revalidates the slot) |
| GET | `/bookings/:code` | Look up a booking by Booking ID |
| POST | `/bookings/:code/reschedule` | Request a new date/time for an existing booking |
| GET | `/portfolio` | Portfolio items |

**Admin** (`/api/admin/*`, see §12 re: auth)
| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard` | KPI counts + revenue |
| GET | `/bookings?status&from&to` | Filtered booking list |
| GET | `/bookings/:id` | Booking detail + client + history + payments |
| POST | `/bookings/:id/status` | Change booking status (validated by state machine) |
| GET | `/calendar?from&to&photographerId` | Bookings in a date range, for the calendar UI |
| GET/PUT | `/availability/rules` | Weekly schedule |
| GET/POST/DELETE | `/availability/overrides` | Date overrides |
| GET | `/services`, `/packages` | Admin listings |

## 8. Setup & Environment Variables

```bash
cd madinah-photographer
npm install
npm start           # http://localhost:3000
```

`.env` (all optional — sensible defaults are built in):
```
PORT=3000
DB_PATH=./data.sqlite
```

No `.env` is required to run the demo — the app seeds `data.sqlite` on
first boot with 1 photographer, 6 services, 18 packages (3 tiers × 6
services), and 6 locations, matching the spec's example data exactly
(e.g. Wednesday OFF, Friday 14:00–21:00).

Admin panel: `http://localhost:3000/admin/index.html` — **no login is
enforced in this build** (see §12). In production, gate `/admin/*` and all
`/api/admin/*` routes behind real authentication before deploying.

## 9. Deployment Instructions

Any Node-capable host works (Render, Railway, Fly.io, a VPS with PM2, etc.):

1. `npm install --omit=dev`
2. Set `PORT` and `DB_PATH` (point `DB_PATH` at a persistent volume — SQLite
   is a single file, so make sure the host's filesystem survives restarts/
   deploys, or migrate to Postgres per §12).
3. `npm start`, or run behind PM2 / systemd for restarts.
4. Put a reverse proxy (Nginx / the platform's built-in one) in front for
   TLS. Serve `/public` assets with far-future cache headers except
   `index.html` and the admin pages.
5. Wire a real WhatsApp/Email provider into
   `lib/notificationEngine.js#sendViaProvider` and a cron/queue worker to
   actually dispatch the `QUEUED` rows in the `notifications` table (see §9
   in the spec — 24h/3h reminders need a scheduler; none runs by default).

## 10. Test Results (spec §42 Quality Control)

All run against this build directly (see transcript in build history):

| Test | Result |
|---|---|
| Client A books 25 Aug 17:00 | ✅ `CONFIRMED`, booking `MDN-2026-0001` created |
| Client B tries 25 Aug 17:00 | ✅ Rejected, HTTP 409, "This time slot is no longer available. Please choose another time." |
| Buffer test: 17:00–18:00 session, 30 min buffer | ✅ Next generated slot is 18:30, not 18:00 |
| Reschedule 17:00 → 19:00 | ✅ Re-validated, updated, old slot recorded in `booking_history`, not deleted |
| Date override test: Wednesday normally OFF (weekly rule) | ✅ Confirmed OFF via weekly rule |
| Date override opens that Wednesday 10:00–18:00 | ✅ Override correctly takes priority, 5 slots generated |
| Date override forces a normally-open day OFF | ✅ Override wins over weekly rule |
| Illegal status transition (CONFIRMED → PENDING) | ✅ Rejected with a clear error, no state change |
| All public pages (`/`, `/services.html`, `/portfolio.html`, `/booking.html`, `/my-booking.html`, `/admin/*`) | ✅ All return HTTP 200 |

**Not yet run:** the spec's "Photographer A booked 17:00, Photographer B
still free at 17:00" test — the schema and engine support multiple
photographers (the UNIQUE constraint and every query are scoped by
`photographer_id`), but the seed data only creates one. Add a second row to
`photographers` + `availability_rules` to exercise it; no code changes
needed.

## 11. Assumptions Made (spec §41/48: ambiguous requirements → documented engineering decisions)

- **Single photographer seeded**, multi-photographer supported by schema/engine but no "Any Available Photographer" picker UI was built (spec §14) — the booking flow always books the first active photographer. Extending it is a UI-only change: loop `getAvailableSlots` across all active photographers and merge.
- **Payment is a UI mock.** No real payment gateway (Stripe/Moyasar/HyperPay etc.) is integrated — the Payment step records the chosen method and deposit amount but does not move money. `payment_status` stays `UNPAID` until an admin marks it manually (a real gateway webhook would call the same status-update path).
- **Golden Hour sunrise/sunset time** (spec §20) is not fetched from a live API — no such API is available in this environment. The abstraction point is the `locations`/`services` join; wiring a sunrise-sunset API (e.g. sunrise-sunset.org) into `availabilityEngine.js` to bias slot recommendations is a self-contained addition.
- **WhatsApp/Email/SMS delivery is not live** — `notificationEngine.js` renders exact message bodies and queues them (`notifications` table, status `QUEUED`), but `sendViaProvider()` intentionally throws until a real provider is configured, per spec §24's requirement not to lock the design to one provider.
- **Auth is scaffolded, not enforced.** The `users` table has a `role` column (`ADMIN`/`PHOTOGRAPHER`/`CLIENT`) and `requireAdmin()` middleware exists as the seam in `routes/admin.js`, but no session/JWT check runs yet — see §12.
- **Currency:** all prices seeded in SAR per spec §21; the `currency` column exists on every money-bearing table so IDR/USD/EUR is a data change, not a schema change.
- **Deposit percentage** defaults to 30% across all seeded packages (spec didn't specify a number); admin-editable per package.

## 12. Known Limitations

- **No authentication/authorization enforced** on `/admin/*` or
  `/api/admin/*` yet — this is the single most important gap before any
  real deployment (spec §34 requires it). The seam (`requireAdmin`) is in
  place; it needs session cookies or JWT + password hashing (e.g. bcrypt +
  `express-session`) wired in.
- **No reminder scheduler.** Notifications are queued but nothing polls
  `notifications` and fires 24h/3h before a session — needs a cron job or
  a queue worker (e.g. `node-cron` + the existing `sendViaProvider` seam).
- **SQLite, single file.** Fine for one photographer / moderate booking
  volume; a studio with many concurrent photographers and high write
  volume should move to Postgres (schema is portable SQL).
- **Portfolio CMS has no upload UI** — the `portfolio` table and API exist,
  but there's no admin form to upload images yet; rows can be inserted
  directly today.
- **No real payment gateway, WhatsApp Business API, or sunrise/sunset API**
  connected — see assumptions above for the exact seams to fill in.
- **Photography imagery is placeholder** (CSS gradients standing in for
  real photos) since no licensed photography assets exist in this
  environment — swap the `.service-thumb` / `.portfolio-item` /
  `.hero` backgrounds for real photos before launch.

## 13. Future Improvements

- "Any Available Photographer" matching across all active photographers
- Real payment gateway + webhook-driven `payment_status` updates
- Session/JWT auth with role checks on every admin route
- A cron/queue worker to actually send queued notifications
- Sunrise/sunset API integration for Golden Hour session recommendations
- Portfolio image upload (multer/S3) + admin CMS form
- SEO: sitemap.xml, robots.txt, per-page structured data (JSON-LD `LocalBusiness`/`Service`)
- Multi-language (Arabic/English toggle) given the Madinah/Umrah audience
