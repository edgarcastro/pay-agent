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
- `src/logger.ts` — shared Pino logger (`LOG_LEVEL`, `LOG_PRETTY`)
- `src/sites.ts` — site definitions (add new sites here)

## Conventions
- Style is owned by Biome (`biome.json`): 2-space indent, double quotes, semicolons, 100-col lines, organized imports. Don't hand-format; run `bun run check:fix`.
- Lint rules: Biome recommended plus `useImportType`, `useNodejsImportProtocol`, `noUnusedImports`, `noUnusedVariables`. Avoid non-null assertions (`!`); narrow instead.
- TypeScript is strict with `verbatimModuleSyntax` and `noUncheckedIndexedAccess`; use `import type` for types.
- Husky runs `bun run verify` on every commit. Fix failures instead of bypassing with `--no-verify`.
- Log with the Pino logger (`logger.child({ site })`), never `console`. Pass structured fields and `err` for errors; never log secret values.
- Never commit the local env file or `.browser-profile/`; document new variables in the example env file and the README.
- The agent must never enter credit card numbers or bank information, and must never select a payment method or kind of payment. It may click buttons or options explicitly named "pay"/"pagar" (e.g. "Pagar"); the user does everything after that (choosing the bank/method, entering card or bank data, confirming).
