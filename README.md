# pay-agent
Un agente para agilizar tus pagos.

Opens your payment sites in Chrome, pre-fills the values you always type (reference, amount) and **leaves the browser open so you review and finish the payment yourself**. It may click buttons named "Pagar"/"Pay", but it never enters card or bank details and never chooses a payment method.

## Setup
```sh
bun install
cp .env.example .env   # then edit your values
```

## Usage
```sh
bun start
```
Each site listed in `SITES` opens in its own tab with its fields filled. Finish the payment in the browser; closing the browser ends the program.

The browser uses a persistent profile in `.browser-profile/`, so cookies (e.g. the cookie banner) are remembered between runs.

## Configuration (`.env`)
| Variable | Description |
| --- | --- |
| `SITES` | Comma-separated site keys to open, e.g. `property` |
| `BROWSER_CHANNEL` | `chrome` (default), `msedge`, or `chromium` (run `bunx playwright install chromium` first) |
| `<KEY>_<FIELD>` | Value per site field, e.g. `PROPERTY_REFERENCE`, `PROPERTY_AMOUNT`. Unset fields are skipped. |

### Available sites
| Key | Site | Fields |
| --- | --- | --- |
| `property` | Property management (AvalPayCenter, Conj Resid Puntalta Altofaro) | `REFERENCE` (apto/torre, digits only), `AMOUNT` (digits only, e.g. `350000`) |
| `surtigas` | Surtigas (portal de recaudo) | `CONTRACT` (número de contrato, digits only) |
| `afinia` | Afinia (Caribemar login) | `EMAIL`, `PASSWORD` (stored in plaintext in your local `.env`; the agent clicks "Ingresar" and opens the invoices page) |
| `acuacar` | Acuacar | `POLICY` (número de póliza, digits with an optional comma) |

## Adding a site
Add an entry to `src/sites.ts` with a `key`, `name`, `url` and its `fields` (each with an `envSuffix` and a Playwright locator, preferably `page.getByLabel(...)`). Then add `<KEY>_<SUFFIX>` values to `.env` and the key to `SITES`. `bunx playwright codegen <url>` helps find locators.

Optional site settings: `steps` (clicks run before the fields, to reveal the form), `fieldTimeoutMs` (how long to wait for a field, so you can navigate manually first), `secret: true` on a field to mask it in logs, and `clickWhenEnabled` for a "Pagar" button that stays disabled until you finish something (e.g. a captcha).

## Development
Linting and formatting use [Biome](https://biomejs.dev). `bun run check` verifies, `bun run check:fix` applies fixes. A Husky pre-commit hook (installed by `bun install`) runs `bun run verify` (Biome + typecheck) before each commit.
