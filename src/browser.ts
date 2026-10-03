import { type BrowserContext, chromium, type Page } from "playwright";
import type { Config, ResolvedSite } from "./config";
import type { ClickDefinition } from "./sites";

const PROFILE_DIR = ".browser-profile";
const FIELD_TIMEOUT_MS = 30_000;
const OPTIONAL_TIMEOUT_MS = 8_000;
const USER_ACTION_TIMEOUT_MS = 10 * 60_000;

export async function openBrowser(config: Config): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: config.browserChannel === "chromium" ? undefined : config.browserChannel,
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });
}

async function runClicks(page: Page, clicks: ClickDefinition[] = []) {
  for (const click of clicks) {
    const element = click.locate(page);
    try {
      await element.waitFor({
        state: "visible",
        timeout: click.optional ? OPTIONAL_TIMEOUT_MS : FIELD_TIMEOUT_MS,
      });
    } catch (error) {
      if (click.optional) continue;
      console.warn(
        `  ✖ ${click.label}: could not click (${(error as Error).message.split("\n")[0]})`,
      );
      continue;
    }
    try {
      await element.click();
      console.log(`  ✔ Clicked ${click.label}`);
    } catch (error) {
      console.warn(
        `  ✖ ${click.label}: could not click (${(error as Error).message.split("\n")[0]})`,
      );
    }
  }
}

/** Opens the site in a new tab and fills its fields. Never enters card/bank data or picks a payment method. */
export async function prepareSite(context: BrowserContext, { site, fields }: ResolvedSite) {
  console.log(`\n▶ ${site.name}`);
  const page = await context.newPage();
  await page.goto(site.url, { waitUntil: "domcontentloaded" });

  await runClicks(page, site.steps);

  let fillFailed = false;
  for (const { field, envName, value } of fields) {
    if (!value) {
      console.warn(`  ⚠ ${field.label}: ${envName} not set, skipping`);
      continue;
    }
    try {
      const input = field.locate(page);
      await input.waitFor({ state: "visible", timeout: site.fieldTimeoutMs ?? FIELD_TIMEOUT_MS });
      await input.clear();
      // Type key by key so the site's input masks/validators react as with a human.
      await input.pressSequentially(value, { delay: field.typeDelayMs ?? 30 });
      await input.blur();

      // The site formats some inputs (e.g. "350.000"), so compare digits only.
      const actual = await input.inputValue();
      const digits = (text: string) => text.replace(/\D/g, "");
      const matches = field.digitsOnly ? digits(actual) === digits(value) : actual === value;
      const shown = field.secret ? "••••••" : actual;
      if (matches) {
        console.log(`  ✔ ${field.label}: ${shown}`);
      } else {
        fillFailed = true;
        // Secrets are never printed, so report lengths to show whether keys were dropped.
        const detail = field.secret
          ? `expected ${value.length} characters but field has ${actual.length}`
          : `expected "${value}" but field shows "${actual}"`;
        console.warn(`  ✖ ${field.label}: ${detail}, please fix it by hand`);
      }
    } catch (error) {
      fillFailed = true;
      console.warn(
        `  ✖ ${field.label}: could not fill (${(error as Error).message.split("\n")[0]})`,
      );
    }
  }

  if (fillFailed && site.clicks?.length) {
    console.warn("  ⚠ Skipping clicks because a field was not filled correctly");
  } else {
    await runClicks(page, site.clicks);
    if (site.navigateAfter) {
      const { waitForUrl, goto } = site.navigateAfter;
      try {
        if (waitForUrl) await page.waitForURL(waitForUrl, { timeout: FIELD_TIMEOUT_MS });
        await page.goto(goto, { waitUntil: "domcontentloaded" });
        console.log(`  ✔ Opened ${goto}`);
      } catch (error) {
        console.warn(`  ✖ Could not open ${goto} (${(error as Error).message.split("\n")[0]})`);
      }
    }
  }

  await page.bringToFront();

  // Not awaited: the user may take minutes, and other sites must still get prepared.
  if (site.clickWhenEnabled) {
    clickWhenEnabled(page, site.name, site.clickWhenEnabled).catch((error) => {
      console.warn(
        `  ✖ ${site.name}: ${site.clickWhenEnabled?.label} not clicked (${(error as Error).message.split("\n")[0]})`,
      );
    });
  }
}

/** Waits until the button is enabled (e.g. after the user solves a captcha), then clicks it. */
async function clickWhenEnabled(page: Page, siteName: string, action: ClickDefinition) {
  const button = action.locate(page);
  const deadline = Date.now() + USER_ACTION_TIMEOUT_MS;
  await button.waitFor({ state: "visible", timeout: USER_ACTION_TIMEOUT_MS });
  console.log(`  … ${siteName}: waiting for "${action.label}" to be enabled`);
  while (Date.now() < deadline) {
    if ((await button.isEnabled()) && (!action.readyWhen || (await action.readyWhen(page)))) {
      await button.click();
      console.log(`\n✔ ${siteName}: clicked ${action.label}`);
      await page.bringToFront();
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("timed out waiting for the button to be enabled");
}
