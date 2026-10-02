import { chromium, type BrowserContext } from "playwright";
import type { Config, ResolvedSite } from "./config";

const PROFILE_DIR = ".browser-profile";
const FIELD_TIMEOUT_MS = 30_000;

export async function openBrowser(config: Config): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: config.browserChannel === "chromium" ? undefined : config.browserChannel,
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });
}

/** Opens the site in a new tab and fills its fields. Never submits anything. */
export async function prepareSite(context: BrowserContext, { site, fields }: ResolvedSite) {
  console.log(`\n▶ ${site.name}`);
  const page = await context.newPage();
  await page.goto(site.url, { waitUntil: "domcontentloaded" });

  for (const { field, envName, value } of fields) {
    if (!value) {
      console.warn(`  ⚠ ${field.label}: ${envName} not set, skipping`);
      continue;
    }
    try {
      const input = field.locate(page);
      await input.waitFor({ state: "visible", timeout: FIELD_TIMEOUT_MS });
      await input.clear();
      // Type key by key so the site's input masks/validators react as with a human.
      await input.pressSequentially(value, { delay: 30 });
      await input.blur();

      // The site formats some inputs (e.g. "350.000"), so compare digits only.
      const actual = await input.inputValue();
      const digits = (text: string) => text.replace(/\D/g, "");
      const matches = field.digitsOnly ? digits(actual) === digits(value) : actual === value;
      if (matches) {
        console.log(`  ✔ ${field.label}: ${actual}`);
      } else {
        console.warn(`  ✖ ${field.label}: expected "${value}" but field shows "${actual}", please fix it by hand`);
      }
    } catch (error) {
      console.warn(`  ✖ ${field.label}: could not fill (${(error as Error).message.split("\n")[0]})`);
    }
  }

  for (const click of site.clicks ?? []) {
    try {
      const element = click.locate(page);
      await element.waitFor({ state: "visible", timeout: FIELD_TIMEOUT_MS });
      await element.click();
      console.log(`  ✔ Clicked ${click.label}`);
    } catch (error) {
      console.warn(`  ✖ ${click.label}: could not click (${(error as Error).message.split("\n")[0]})`);
    }
  }

  await page.bringToFront();
}
