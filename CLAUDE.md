# pay-agent

Bun + TypeScript + Playwright CLI. Opens payment sites in a persistent Chrome profile, pre-fills the fields, and leaves the browser open so the user reviews and pays. See `README.md` for usage, configuration and how to add a site.

## Commands
- `bun start` — run the agent
- `bun run check` — Biome lint + format + import order (no writes)
- `bun run check:fix` — same, applying safe fixes
- `bun run typecheck` — `tsc --noEmit`
- `bun run verify` — `check` + `typecheck`; this is what the pre-commit hook runs

## Layout
- `src/index.ts` — entrypoint: load config, open browser, prepare each site
- `src/config.ts` — parses the environment config into resolved sites/fields
- `src/browser.ts` — Playwright launch, field filling and clicks
- `src/sites.ts` — site definitions (add new sites here)

## Conventions
- Style is owned by Biome (`biome.json`): 2-space indent, double quotes, semicolons, 100-col lines, organized imports. Don't hand-format; run `bun run check:fix`.
- Lint rules: Biome recommended plus `useImportType`, `useNodejsImportProtocol`, `noUnusedImports`, `noUnusedVariables`. Avoid non-null assertions (`!`); narrow instead.
- TypeScript is strict with `verbatimModuleSyntax` and `noUncheckedIndexedAccess`; use `import type` for types.
- Husky runs `bun run verify` on every commit. Fix failures instead of bypassing with `--no-verify`.
- Never commit the local env file or `.browser-profile/`; document new variables in the example env file and the README.
- The agent must not submit payments itself; the user does the final step.
