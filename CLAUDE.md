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

Two member types:
- **Residents** (`member`) — 8 free hours/month, no payment required
- **Non-members** (`non-member`) — 14,000₩/hour

### Directory Structure

```
app/
  page.tsx              # Main booking UI (~1,775 lines, client component)
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
  prepaid-utils.ts      # getTotalRemainingHours, calculatePrepaidUsage
  prepaid/booking-utils.ts
  notifications/sender.ts, templates.ts
  cron/jobs.ts, wrapper.ts
  types/prepaid.ts
supabase/migrations/    # 18+ SQL migration files (001–018)
```

### Data Flow

All user-facing data mutations go through **Server Actions** (`app/actions/`), not API routes. API routes are used only for prepaid REST endpoints and cron jobs.

The Supabase client pattern:
- `lib/supabase.ts` — browser/client components
- `lib/supabase/server.ts` → `createClient()` — server actions (respects RLS)
- `lib/supabase/server.ts` → `createServiceRoleClient()` — admin operations that bypass RLS (server-only)

### Prepaid Ticket System (Phase 6.5)

Users can purchase prepaid hour bundles (e.g. 10 hours for 100,000₩). When booking, prepaid hours are consumed atomically via the Supabase RPC function `create_booking_with_prepaid()` (defined in migration `016_booking_prepaid_rpc.sql`). Key fields on `bookings`: `prepaid_hours_used`, `regular_hours`, `payment_method` (`'free'|'regular'`), `user_id`.

Refund formula: `remaining_hours × 14,000₩`.

### Authentication

Custom auth (not Supabase Auth). Users table with `password_hash` (bcryptjs). Admin auth is separate (`app/admin/login/`). New user accounts start as `status: 'pending'` and require admin approval.

### SMS Notifications

SOLAPI (`lib/solapi.ts`) is the active SMS provider. `lib/aligo.ts` is deprecated. Notifications are sent on booking confirmation and prepaid refunds. Templates are stored in the `message_templates` DB table and managed via the admin UI.

### Database Migrations

Migrations live in `supabase/migrations/` and must be run manually against the Supabase project. There is no migration runner in `package.json`. Key migrations:
- `013` — prepaid tables
- `015` — booking/prepaid integration
- `016` — `create_booking_with_prepaid` RPC
- `017` — time casting fixes
- `018` — prepaid payment status

### Key Conventions

- **Path alias**: `@/` maps to the project root
- **Styling**: Tailwind CSS only — no CSS modules or styled-components
- **TypeScript strict mode** enabled
- **Korean UI**: All user-facing text is in Korean
- Cron jobs require `Authorization: Bearer <CRON_SECRET>` header (set via env var)
