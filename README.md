# NestEgg — Phone Banking for Elders

NestEgg helps older adults understand and manage their money **by phone call** — no app, no login, no PIN-typing on a tiny screen. A user calls the phone assistant Robin (or Robin calls them) and talks through balances, bills, and spending in plain language. A family caretaker links the bank account, sets budgets and safety rules, and supervises everything from a web dashboard.

See [`CONTEXT.md`](./CONTEXT.md) for the full glossary of terms (user, Caretaker, Change Request, Alert, Safe to Spend, etc.) used throughout the code and docs.

## What it does

- **User calls Robin, or Robin calls the user.** One [ElevenLabs](https://elevenlabs.io) voice agent (over Twilio) handles both directions, gated by a spoken PIN before any account details are shared — even on calls Robin places.
- **Ask by voice:** current balance, upcoming bills, recent transactions, "can I afford this?" (Safe to Spend), and budget status.
- **Propose changes by voice:** a user can ask to raise a budget or flag a transaction; depending on the caretaker's permission tier the change applies instantly, applies with a notification, or waits for caretaker approval.
- **Proactive alerts:** NestEgg calls the user about a projected shortfall, an unfunded bill due soon, an unusual transaction, or a deposit that arrived — each deduplicated so the same real-world event never triggers two calls.
- **Caretaker dashboard (web):** link a bank account (mock provider or [Plaid](https://plaid.com)), set budgets and alert rules, review pending approvals, read call summaries/transcripts, and get notified by email.
- **Native app:** a lighter user-facing view built with Expo/React Native.

### Why phone calls, not an app

Voice is the interface an older adult already knows how to use. NestEgg trades screens and passwords for a conversation, while every financial action still goes through the same server-side authorization and audit trail a dashboard would have — see the [ADRs](./docs/adr) for how identity and permissions are enforced independent of what the voice model says or hallucinates.

## Stack

TypeScript monorepo on [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack): React + TanStack Start/Router (web), React Native + Expo (native), oRPC, Drizzle + PostgreSQL, Better-Auth, Turborepo, Oxlint/Oxfmt — plus ElevenLabs (voice agent), Twilio (telephony), Plaid (bank data), Gemini (fraud check), and Vercel (hosting + cron).

## Project Structure

```
steelhacks-2026/
├── apps/
│   ├── web/         # Caretaker dashboard (React + TanStack Start) + server/API routes
│   └── native/      # user-facing mobile app (React Native, Expo)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # oRPC routers + business logic (alerts, budgets, change requests, voice tools)
│   ├── auth/        # Authentication configuration & logic
│   ├── db/          # Database schema & queries
│   ├── finance/     # Shared money/finance domain logic
│   └── config/      # Shared config
└── docs/
    ├── robin-prompt.md      # Robin's ElevenLabs system prompt (source of truth)
    ├── agent-tools.json    # Robin's tool schema, pushed via sync-agent
    ├── adr/                # Architecture decisions (PIN gating, single-agent design)
    └── plans/              # Implementation plans
```

## Getting Started

Install dependencies:

```bash
pnpm install
```

### Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.
3. Apply the schema to your database:

```bash
pnpm run db:push
```

Then run the dev server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) for the caretaker dashboard. Use the Expo Go app to run the mobile application.

By default `BANK_PROVIDER=mock` serves seeded demo data, so you can explore the dashboard without a Plaid account. Run `pnpm run db:seed` (via the `web` app) to seed a demo user/caretaker.

### Voice agent (Robin) setup

Voice features (`ELEVENLABS_*`) are optional for running the dashboard, but required to actually talk to Robin:

1. Create an ElevenLabs Conversational AI agent and phone number.
2. Set `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `ELEVENLABS_TOOL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET` in `apps/web/.env`.
3. Push the prompt and tool schema (`docs/robin-prompt.md`, `docs/agent-tools.json`) to the agent with the `sync-agent` script.
4. Set `DEMO_user_PHONE` to the E.164 number you'll call from for a demo.

Read [`docs/plans/voice-line.md`](./docs/plans/voice-line.md) for the full wiring (webhooks, PIN gate, alert dedupe) and [`docs/adr`](./docs/adr) for why it's built that way.

## UI Customization

Web and native share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@steelhacks-2026/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema` (see `apps/web/.env.schema` for the full list of variables, including bank provider, ElevenLabs, SMTP, and cron secrets). Varlock generates `src/env.ts` during installation; run `pnpm run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Vercel Services

- Target: web + server
- Config: `vercel.json`
- Link the project first: `pnpm run deploy:setup`
- Local Vercel dev: `pnpm run dev:vercel`
- Sync preview env: `pnpm run env:preview`
- Sync production env: `pnpm run env:production`
- Dry-run check (no upload): `pnpm run deploy:check`
- Preview deploy: `pnpm run deploy`
- Production deploy: `pnpm run deploy:prod`

Vercel Services share project environment variables, but deploys do not upload local `.env` files automatically. Link the project with `vercel link`, then run the env sync command before your first deploy (otherwise the deployment starts with no env vars), or pass one-off envs with `vercel deploy -e KEY=value`. Pass Vercel CLI flags to the env sync command directly, for example: `pnpm run env:production --scope your-team`.

Cron endpoints (`/api/cron/*`, e.g. daily alerts) run on Vercel's daily cron schedule (Hobby plan limit) and are protected by `CRON_SECRET`; trigger them manually during a demo if you need a faster cadence.

For more details, see the guide on [Deploying to Vercel](https://www.better-t-stack.dev/docs/guides/vercel).

## Git Hooks and Formatting

- Run checks: `pnpm run check`

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run dev:native`: Start the React Native/Expo development server
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:studio`: Open database studio UI
- `pnpm run check`: Run Oxlint and Oxfmt
- `pnpm run deploy:setup`: Link this repo to a Vercel project (first-time setup)
- `pnpm run dev:vercel`: Run the Vercel Services dev environment locally
- `pnpm run env:preview`: Sync local env files to the Vercel preview environment
- `pnpm run env:production`: Sync local env files to the Vercel production environment
- `pnpm run deploy`: Create a Vercel preview deployment
- `pnpm run deploy:prod`: Deploy to Vercel production
- `pnpm run deploy:check`: Dry-run a deploy to preview framework detection and included files without uploading

## Better Auth Schema Generation

After changing auth plugins or schema options, run `pnpm run auth:generate` from the project root. The script runs the Better Auth CLI through `varlock run` from the owning app directory, loading the auth instance from `src/services.ts`. Review the schema changes, then use your ORM's migration workflow to apply them.
