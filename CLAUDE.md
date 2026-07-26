# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server on http://localhost:3000
npm run build    # Build for production
npm run start    # Run production server
npm run lint     # Run ESLint
```

No test runner is configured (`npm run test` does not exist). Playwright is installed for e2e testing but no test scripts are wired up.

## Architecture

**Oneum (온음)** is a Korean community space booking system built with Next.js 14 App Router, React 18, TypeScript 5, Tailwind CSS, and Supabase (PostgreSQL).

Two bookable spaces:
- `nolter` — 놀터 (community/lounge area)
- `soundroom` — 방음실 (soundproof practice room)

Three effective user kinds (see `lib/booking-policy.ts` → `resolveUserKind()`):
- **Residents** (온음 세대원) — `users.is_resident = true` **and** a non-empty `users.household`
- **Members** — logged in, but not a resident (no free hours; may hold prepaid tickets)
- **Guests** — not logged in (14,000₩/hour, no prepaid)

Note: `bookings.member_type = 'member'` historically means **resident**, not "logged-in member".
See "Booking pricing policy" below.

### Directory Structure

```
app/
  page.tsx              # Main booking UI (~1,900 lines, client component)
  layout.tsx
  actions/              # Next.js Server Actions (primary backend layer)
    bookings.ts         # createBooking, getBookings, cancelBooking
    auth.ts             # login, signup (bcryptjs password hashing)
    prepaid.ts          # getMyPrepaidPurchases
    structured-settings.ts  # getSpacesInfo, getGeneralRulesFromDB
    space-photos.ts
    admin-*.ts          # Admin-only actions (bookings, users, templates, stats…)
    payments.ts, usage.ts
  api/
    prepaid/            # REST endpoints for prepaid ticket system
    bookings/preview/   # Booking preview
    cron/[job]/         # Cron jobs secured with CRON_SECRET header
  admin/                # Admin dashboard (separate auth, layout)
  components/
    PrepaidCard.tsx
    PrepaidPurchaseModal.tsx
    space-gallery/      # SpaceGallery, GallerySlide, GalleryNav, Lightbox
lib/
  supabase.ts           # Browser client
  supabase/server.ts    # createClient() and createServiceRoleClient()
  auth.ts
  solapi.ts             # SMS via SOLAPI (replaces deprecated lib/aligo.ts)
  phone-utils.ts
  booking-policy.ts     # 단일 요금 계산기 (클라이언트/서버 공용, 의존성 없는 순수 모듈)
  prepaid-utils.ts      # getTotalRemainingHours, calculatePrepaidUsage (booking-policy에 위임)
  prepaid/booking-utils.ts  # 선불권 조회/차감 헬퍼 + /api/bookings/preview 지원
  notifications/sender.ts, templates.ts
  cron/jobs.ts, wrapper.ts
  types/prepaid.ts
supabase/migrations/    # SQL migration files (001–031)
```

### Data Flow

All user-facing data mutations go through **Server Actions** (`app/actions/`), not API routes. API routes are used only for prepaid REST endpoints and cron jobs.

The Supabase client pattern:
- `lib/supabase.ts` — browser/client components
- `lib/supabase/server.ts` → `createClient()` — server actions (respects RLS)
- `lib/supabase/server.ts` → `createServiceRoleClient()` — admin operations that bypass RLS (server-only)

### Prepaid Ticket System (Phase 6.5)

Users can purchase prepaid hour bundles (e.g. 10 hours for 100,000₩). Every booking — free, prepaid, or paid — goes through the Supabase RPC `create_booking_with_prepaid()` (current definition: migration `031_household_free_hours.sql`), which validates the household free-hour quota, inserts the booking, and deducts prepaid hours in one transaction.

Key fields on `bookings`: `free_hours_used`, `prepaid_hours_used`, `regular_hours` (all NUMERIC(10,1), in **hours**), `amount`, `payment_method`, `user_id`.

Refund formula: `remaining_hours × 14,000₩`.

### Booking pricing policy

- Slots are **30 minutes**; `times.length / 2` = hours. Hours are stored as hours, never as slot counts.
- **Residents**: 놀터 **20 free hours per household per month**, keyed on the calendar month of `booking_date` (not the request date). 방음실 is **unlimited free** and does not consume the 20-hour pool.
- Free hours are consumed **partially** — a 3h booking with 2h left is 2h free + 1h charged in a single row.
- Beyond free hours: **prepaid hours first, then 14,000₩/hour cash**.
- Ledger: `bookings.free_hours_used`. Cancelled rows are excluded from the monthly sum, so cancelling a booking automatically returns its free hours to the household.
- `payment_method` describes the **money dimension only**: `free` / `prepaid` / `mixed` / `regular`. `nolter_paid` is a legacy value from the pre-2026-07 놀터 10,000₩-per-booking policy and is no longer written.
- `status` / `payment_status` derive from **`amount > 0`** (money owed ⇔ `pending`), not from `payment_method`.
- Enforcement lives in the RPC (`pg_advisory_xact_lock` on `(household, month)` + re-sum), so concurrent bookings in one household cannot exceed the quota. `lib/booking-policy.ts` is the shared pure calculator used by both the client preview and the server action — never recompute prices elsewhere.

### Authentication

Custom auth (not Supabase Auth). Users table with `password_hash` (bcryptjs). Admin auth is separate (`app/admin/login/`). New user accounts start as `status: 'pending'` and require admin approval.

### SMS Notifications

SOLAPI (`lib/solapi.ts`) is the active SMS provider. `lib/aligo.ts` is deprecated. Notifications are sent on booking confirmation and prepaid refunds. Templates are stored in the `message_templates` DB table and managed via the admin UI.

### Database Migrations

Migrations live in `supabase/migrations/` and must be run manually against the Supabase project. There is no migration runner in `package.json`. Key migrations:
- `013` — prepaid tables
- `015` — booking/prepaid integration
- `016` — `create_booking_with_prepaid` RPC (first JSONB version)
- `017` — time casting fixes
- `018` — prepaid payment status
- `023` — resident policy v1: 놀터 3 free bookings/month (superseded by `031`)
- `028`/`029` — NUMERIC(10,1) hours + RPC update
- `031` — **current**: household 20 free hours/month, `free_hours_used` ledger, quota guard in the RPC

### Key Conventions

- **Path alias**: `@/` maps to the project root
- **Styling**: Tailwind CSS only — no CSS modules or styled-components
- **TypeScript strict mode** enabled
- **Korean UI**: All user-facing text is in Korean
- Cron jobs require `Authorization: Bearer <CRON_SECRET>` header (set via env var)
