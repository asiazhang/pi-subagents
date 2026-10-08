# Development Rules

## Conversational Style

- No emojis in code
- Technical prose only, be direct
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.

## Code Quality

- Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
- No `any` unless absolutely necessary.
- Inline single-line helpers that have only one call site.
- Check `node_modules` for external API types (`@earendil-works/pi-*`, `@sinclair/typebox`, etc.); don't guess.
- **No inline imports** (`await import()`, `import("pkg").Type`, dynamic type imports). Top-level imports only.
- Always ask before removing functionality or code that appears intentional. Fix type errors from outdated deps by upgrading the dep, not by removing or downgrading code.
- Do not preserve backward compatibility unless the user asks for it.
- Match the surrounding code style — it is enforced by biome (`biome.json`).
- This is a pi extension. Respect the Claude Code-compatible tool names, calling conventions, and UI patterns the extension deliberately mirrors; don't diverge from them without a stated reason.
- When reviewing a diff, favor solutions that are elegant, not overengineered — flag needless abstraction, layering, or defensive code that the change doesn't warrant.

## Documentation

Read the file that covers a surface before changing its behavior; update it in the same change.

| File | Covers |
|---|---|
| `README.md` | User-facing reference: features, install, tool parameter tables, commands, settings and defaults, the event table, the RPC channel list, and the `src/` file map (`## Architecture`). Source of truth for defaults and setting names. |
| `docs/workflows.md` | `SubagentWorkflow` in depth — how the model writes a script, editing and re-running it, saving a named workflow, `agent()` options, recipes, troubleshooting. Examples in `examples/workflows/`. |
| `docs/rpc.md` | Calling this extension from another pi extension — `pi.events` lifecycle events (`subagents:completed`, `subagents:ready`, …), the `subagents:rpc:*` channels (`ping`, `spawn`, `stop`, `consume`), spawn options, error strings, and the `Symbol.for("pi-subagents:manager")` registry. Source: `src/cross-extension-rpc.ts`. |

`README.md` holds the reference tables and links out; `docs/` holds the long-form guides. Renaming an event, an RPC channel, a reply-envelope field, or a workflow global is a docs change too.

## Commands

- After code changes (not docs), run `npm run check` (lint + typecheck + test) and fix all errors and warnings.
- To iterate on a single test file: `npx vitest run test/<file>.test.ts`.
- If you create or modify a test file, run it and iterate on the test or implementation until it passes.
- `npm run build` compiles with `tsc`; run it only when verifying the build output or when requested.
- `npm run bench` runs the benchmarks in `test/perf/*.bench.ts`. Opt-in: not part of the check suite. `npm run bench:ab -- <ref>` benchmarks the working tree against another commit. The `*.perf.test.ts` guards assert operation counts, not time, and DO run in the normal suite.
- For ad-hoc scripts, write them to a temp file (e.g. `/tmp`), run, edit if needed, remove when done. Don't embed multi-line scripts in `bash` commands.

## User Override

If the user's instructions conflict with any rule in this document, ask for explicit confirmation before overriding. Only then execute their instructions.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary; label strings equal the role names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
