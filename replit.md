# FreelanceTM

First digital freelance platform for Turkmenistan — a modern marketplace connecting local businesses with digital specialists (TikTok editors, Telegram bot devs, designers, AI creators).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at /api)
- `pnpm --filter @workspace/freelance-tm run dev` — run the frontend (proxied at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind + Framer Motion + Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/db/src/schema/` — Drizzle schema (users, categories, gigs, orders, reviews, messages)
- `artifacts/api-server/src/routes/` — Express route handlers (users, categories, gigs, orders, reviews, messages)
- `artifacts/freelance-tm/src/pages/` — React pages (home, gigs, gig detail, profile, dashboard, order, create-gig, login)
- `lib/api-client-react/src/generated/` — Generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — Generated Zod schemas for server validation (do not edit)

## Architecture decisions

- Contract-first: OpenAPI spec drives codegen for both frontend hooks and server Zod validators
- Auth is header-based for now (`x-user-id`): frontend stores user ID in localStorage after login/register
- Escrow and payments are planned for Phase 2 — orders are tracked in DB with status state machine
- Categories are seeded at DB level (5 digital-only categories for MVP)
- Featured gigs are flagged with `is_featured` boolean in DB

## Product

MVP covers:
- **Browse gigs** — search by category, price, keyword
- **Gig detail** — full info with seller profile, reviews, order button
- **Freelancer profiles** — skills, rating, completed orders, portfolio gigs
- **Dashboard** — my orders (as buyer or seller), my gigs
- **Create gig** — freelancers post services with pricing and delivery time
- **Order chat** — in-order messaging between buyer and seller
- **Auth** — email/username registration stored in localStorage

## User preferences

- Dark mode by default (futuristic, premium digital atmosphere)
- Platform focus: digital services only (Telegram, TikTok, Design, Dev, AI)
- Language: Russian/Turkmen dual-market

## Gotchas

- Run codegen after every OpenAPI spec change: `pnpm --filter @workspace/api-spec run codegen`
- `x-user-id` header must be sent with all authenticated requests (frontend reads from localStorage)
- Use `inArray()` from drizzle-orm for multi-ID lookups — do NOT use raw `sql ANY()` template
- The `gigs/featured` and `gigs/stats` routes must come BEFORE `gigs/:gigId` in Express to avoid param conflicts

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
