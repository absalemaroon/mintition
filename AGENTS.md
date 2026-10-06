# Mintition — Base44 Dev Environment

## Overview
NFT bulk-minting platform for Celo blockchain. Next.js 16 + Supabase + ethers.js.
Frontend uses the **Paper Geometry** design language (warm paper, ink, terracotta, teal).

## Running the app
```bash
docker compose -f docker-compose.base44.yml up -d
```
- Web entry: http://localhost:3000 → redirects to `/auth/login`
- Dev server: `npx next dev -H 0.0.0.0 -p 3000` inside `node:22-slim`
- Live reload is active (Next.js dev mode)

## Supabase credentials
The app requires three Supabase env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Without valid credentials, the middleware guards skip Supabase calls and redirect all routes to `/auth/login`.
The login page renders but auth won't work until real credentials are added via the Secrets page.
Placeholder values in `.env.base44-defaults` are overridden by `/run/base44/app.env`.

## Paper Geometry design system
- Defined in `app/globals.css` (primary) and `styles/globals.css` (mirror)
- Custom utility classes: `.paper-card`, `.glass`, `.ink-heading`, `.ink-btn-terracotta`, `.ink-btn-teal`, `.paper-texture`
- Color palette via CSS custom properties (oklch):
  - Background: warm paper `oklch(0.96 0.015 80)` → `#f7f1e7`
  - Primary: ink `oklch(0.25 0.015 50)` → `#28201b`
  - Accent: terracotta `oklch(0.72 0.12 40)` → `#e4896a`
  - Teal: muted `oklch(0.62 0.06 195)` → `#599291`

## Navigation architecture
- `components/paper-nav.tsx` — responsive sidebar nav (persistent on desktop, slide-in on mobile)
- `components/dashboard.tsx` — main dashboard using sidebar nav with section switching (wallets/funding/mint/batches)
- Replaced the old top-bar header + tabs layout

## Key files
- `proxy.ts` + `lib/supabase/proxy.ts` — Next.js middleware with Supabase URL validation guard
- `lib/supabase/server.ts` / `lib/supabase/client.ts` — Supabase client factories with dev-mode fallback
- `components/ui/` — shadcn/ui components (unchanged, styled via CSS variables)

## Tech notes
- Tailwind v4 via `@tailwindcss/postcss` (no tailwind.config needed)
- `next.config.mjs` has `allowedDevOrigins` for Base44 preview host
- `pnpm-workspace.yaml` manages pnpm build permissions
- TypeScript build errors are ignored (`typescript.ignoreBuildErrors: true` in next.config)
