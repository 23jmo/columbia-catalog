# LionPlan — agent working agreement

Read this before touching anything. Multiple agents are building this repo in
parallel right now. Staying inside your lane is more important than being
thorough outside it.

## Hard rules

1. **Never modify these files.** They are shared and another agent is depending
   on their exact contents:
   - `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`,
     `postcss.config.mjs`, `eslint.config.mjs`
   - `lib/types.ts`, `lib/constants.ts`
   - `styles/**`, `utils/**`, `hooks/use-count-up.ts`
   - `components/base/**`, `components/application/**` (BoardUI-generated)
   - `app/layout.tsx`
   - `AGENTS.md`

2. **Never run `npm install`.** Every dependency you need is already installed.
   If something is genuinely missing, say so in your final report and work
   around it. Do not add dependencies.

   > **Amendment — 2026-08-24, owner decision.** Rules 1 and 2 were lifted once,
   > for one purpose: the natural-language agent. `package.json` gained `ai`
   > (the SDK), `@ai-sdk/react` (its `useChat` hook, needed by the client) and
   > `@ai-sdk/openai` (the provider), and `npm install` was run.
   >
   > This is recorded here so the next agent to read these rules does not find a
   > dependency that "shouldn't" exist and try to remove it, or conclude the
   > rules are advisory. **They are not.** The exception was granted explicitly,
   > in advance, for that one package. Rules 1 and 2 apply in full to everything
   > else and to every other agent.
   >
   > Two things worth knowing before touching that dependency:
   >
   > - **Do not trust recalled knowledge of this SDK.** v7 renamed enough that
   >   confident memory is worse than no memory — `stepCountIs` is now
   >   `isStepCount`, and `useChat` changed substantially. Verify against
   >   `node_modules/ai/docs/` and `node_modules/ai/dist/index.d.ts`, which ship
   >   with the installed version and are therefore correct for it.
   > - **Do not hard-code a model id from memory either.** The agent runs on
   >   whichever of two credentials is present — `OPENAI_API_KEY` wins,
   >   otherwise the Vercel AI Gateway — and each names its models differently,
   >   so read the ids from the source that matches the route. Gateway:
   >   `curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[].id'`.
   >   OpenAI: the capability table in
   >   `node_modules/@ai-sdk/openai/docs/03-openai.mdx`, which is also where to
   >   check that a tier still supports tool calling before switching to it.

3. **Only create or edit files inside the directories you own.** They are listed
   in your task prompt. If you need something from another lane, define a
   narrow local interface and code against it — do not reach into their files.

4. **All shared domain types come from `@/lib/types`.** All shared constants
   come from `@/lib/constants`. Do not redeclare `Section`, `Course`, `Meeting`,
   `Plan`, `CrawlJob`, etc. If you need a type that is genuinely local to your
   module, define it in your own directory.

## Stack

- Next.js 16.3 App Router, React 19, TypeScript strict, Tailwind v4
- BoardUI component library (already installed, see below)
- Supabase (Postgres + Google SSO + realtime + pgvector)
- Recharts + Motion (installed via BoardUI)
- `node-html-parser` for HTML parsing, `zod` for validation
- `@tanstack/react-virtual` for list virtualization
- `vitest` for tests (`npx vitest run`)

## Using BoardUI

Components live in `components/base/**` and `components/application/**` and are
already generated. **Import them, do not rewrite them.** Examples:

```tsx
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { cx } from "@/utils/cx";
```

Run `ls components/base components/application` to see what exists, and read a
component's source before using it — props are not guessable.

**Charts are BoardUI Pro and are NOT installed.** Build chart components on
`recharts` directly, styled with the BoardUI chart tokens
(`--color-chart-1` … `--color-chart-8`, `--color-chart-neutral`,
`--color-chart-cursor`).

### Styling

Use BoardUI semantic tokens as Tailwind classes, never raw hex and never
`dark:` prefixes — tokens flip automatically under `.dark`:

- Background: `bg-background-full`, `bg-background-primary-default`,
  `bg-background-secondary-default`, `bg-background-tertiary-default`
- Text: `text-text-primary`, `text-text-secondary`, `text-text-tertiary`
- Border: `border-border-table`, `border-border-button-default`
- Type scale: composite utilities like `text-sm-medium`, `text-md-semibold`
  (see `styles/typography.css` for the full set)

## Product rules that are not negotiable

These come from the spec and are wrong to violate even if convenient:

- **Read-only toward Columbia.** Never issue POST/PATCH/PUT/DELETE to any
  `columbia.edu` host. We never register, drop, or waitlist anyone.
- **Never store a Vergil/SAS bearer token.** We do not touch them at all.
- **Every seat number renders with its provenance** — the directory's own
  "as of" timestamp travels with the data and is displayed.
- **Never overwrite good data with worse data.** An ingest producing fewer or
  emptier records than the previous run for the same key is quarantined.
- **Course quality and instructor quality are scored separately.** Never
  average them into a single number.
- **Search must never touch the network.** It runs against a local index.
- **Writes require an account; all reads are free.**

## Reference documents

- `vergil_api_spec.md` (repo root) — data sources, endpoint inventory,
  access-control findings. Read the sections relevant to your lane.
- `~/.claude/skills/interview/columbia-catalog/columbia-catalog-spec.md` — the
  full product and technical spec. Your lane's section is named in your prompt.

## Fixtures

Real HTML captured from live Columbia sources lives in
`lib/ingest/__fixtures__/`:

- `doc-root.html` — directory index, all subjects
- `doc-subject-COMS-Fall2026.html` — every COMS section for Fall 2026 (138)
- `doc-section-COMS4113-001.html` — one section detail page
- `bulletin-cs.html` — bulletin CS page, carries meeting times

Parse against these, not against assumptions.

## Definition of done

- `npx tsc --noEmit` passes for the files you wrote
- Any tests you wrote pass under `npx vitest run`
- No `any` unless genuinely unavoidable, and commented when used
- Your final report lists: files created, what works, what is stubbed, and
  anything you need from another lane

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
