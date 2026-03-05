# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server on http://localhost:3000
npm run build    # Build for production
npm run start    # Run production server
npm run lint     # Run ESLint
```

No test runner is configured. There is no `npm run test` command.

## Architecture

**Oneum (온음)** is a Korean community space booking system built with Next.js 14 App Router, React 18, TypeScript 5, and Tailwind CSS.

The app allows users to book two types of spaces:
- 놀터 (community/play area)
- 방음실 (soundproof practice room)

### Structure

The entire application currently lives in `app/page.tsx` as a single monolithic component — there are no separate components, API routes, or utility files yet. The calendar UI is static (hardcoded to a specific month). There is no backend, database, state management library, or authentication.

### Key conventions

- **Path alias**: `@/` maps to the project root (configured in `tsconfig.json`)
- **App Router**: Routing uses the `app/` directory (Next.js App Router, not Pages Router)
- **Styling**: Tailwind CSS utility classes only — no CSS modules or styled-components
- **TypeScript strict mode** is enabled

### Planned expansion areas

The project is early-stage. Future work will likely involve: interactive calendar state, API routes under `app/api/`, database integration, user authentication, and extracting reusable components from `app/page.tsx`.
