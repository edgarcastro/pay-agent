import type { Logger } from "pino";
import { type BrowserContext, chromium, type Page } from "playwright";
import type { Config, ResolvedField, ResolvedSite } from "./config";
import { logger } from "./logger";
import type { ClickDefinition, SiteDefinition } from "./sites";

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

async function runClicks(page: Page, log: Logger, clicks: ClickDefinition[] = []) {
  for (const click of clicks) {
    const element = click.locate(page);
    try {
      await element.waitFor({
        state: "visible",
        timeout: click.optional ? OPTIONAL_TIMEOUT_MS : FIELD_TIMEOUT_MS,
      });
    } catch (error) {
      if (click.optional) continue;
      log.warn({ err: error, click: click.label }, "Could not find element to click");
      continue;
    }
    try {
      await element.click();
      log.info({ click: click.label }, "Clicked");
    } catch (error) {
      log.warn({ err: error, click: click.label }, "Could not click");
    }
  }
}

/** Fills the given fields in order; returns true if any of them could not be filled correctly. */
async function fillFields(
  page: Page,
  log: Logger,
  site: SiteDefinition,
  fields: ResolvedField[],
): Promise<boolean> {
  let fillFailed = false;
  for (const { field, envName, value } of fields) {
    if (!value) {
      log.warn({ field: field.label, envName }, "Env var not set, skipping field");
      continue;
    }
    try {
      const input = field.locate(page);
      await input.waitFor({ state: "visible", timeout: site.fieldTimeoutMs ?? FIELD_TIMEOUT_MS });

      if (field.option) {
        const option = field.option(page, value);
        await input.click();
        await option.waitFor({ state: "visible", timeout: OPTIONAL_TIMEOUT_MS });
        // Read the label first: custom dropdowns remove their options once one is picked.
        const name = (await option.innerText()).trim();
        await option.click();
        // Material selects flag the option; custom ones show the choice in a readonly input.
        const shownText = await input.evaluate((el) => el.querySelector("input")?.value ?? "");
        const flagged = await option
          .getAttribute("aria-selected", { timeout: 1_000 })
          .catch(() => null);
        if (shownText.trim() === name || flagged === "true") {
          log.info({ field: field.label, shown: value }, "Option selected");
        } else {
          fillFailed = true;
          log.warn(
            { field: field.label, expected: value },
            "Option not selected, please pick it by hand",
          );
        }
        continue;
      }
      const digits = (text: string) => text.replace(/\D/g, "");
      const isMatch = (actual: string) =>
        // The site formats some inputs (e.g. "350.000"), so compare digits only.
        field.digitsOnly ? digits(actual) === digits(value) : actual === value;

      await input.clear();
      // Type key by key so the site's input masks/validators react as with a human.
      await input.pressSequentially(value, { delay: field.typeDelayMs ?? 30 });
      await input.blur();
      let actual = await input.inputValue();
      let matches = isMatch(actual);

      if (!matches) {
        // Page scripts can drop or wipe keystrokes while typing; set the value in one go instead.
        log.debug({ field: field.label }, "Typed value mismatch, retrying with fill");
        await input.fill(value);
        await input.blur();
        actual = await input.inputValue();
        matches = isMatch(actual);
      }
      const shown = field.secret ? "••••••" : actual;
      if (matches) {
        log.info({ field: field.label, shown }, "Field filled");
      } else {
        fillFailed = true;
        // Secrets are never printed, so report lengths to show whether keys were dropped.
        const detail = field.secret
          ? { expectedLength: value.length, actualLength: actual.length }
          : { expected: value, actual };
        log.warn({ field: field.label, ...detail }, "Field value mismatch, please fix it by hand");
      }
    } catch (error) {
      fillFailed = true;
      log.warn({ err: error, field: field.label }, "Could not fill field");
    }
  }
  return fillFailed;
}

/** Opens the site in a new tab and fills its fields. Never enters card/bank data or picks a payment method. */
export async function prepareSite(context: BrowserContext, { site, fields }: ResolvedSite) {
  const log = logger.child({ site: site.key });
  log.info({ name: site.name, url: site.url }, "Preparing site");
  const page = await context.newPage();
  await page.goto(site.url, { waitUntil: "domcontentloaded" });

  await runClicks(page, log, site.steps);

  const afterPay = fields.filter(({ field }) => field.afterPay);
  const fillFailed = await fillFields(
    page,
    log,
    site,
    fields.filter(({ field }) => !field.afterPay),
  );

  if (fillFailed && site.clicks?.length) {
    log.warn("Skipping clicks because a field was not filled correctly");
  } else {
    await runClicks(page, log, site.clicks);
    if (site.navigateAfter) {
      const { waitForUrl, goto } = site.navigateAfter;
      try {
        if (waitForUrl) await page.waitForURL(waitForUrl, { timeout: FIELD_TIMEOUT_MS });
        await page.goto(goto, { waitUntil: "domcontentloaded" });
        log.info({ goto }, "Opened page after clicks");
      } catch (error) {
        log.warn({ err: error, goto, url: page.url() }, "Could not open page after clicks");
      }
    }
  }

  await page.bringToFront();

  // Not awaited: the user may take minutes, and other sites must still get prepared.
  const { clickWhenEnabled: payButton } = site;
  if (payButton) {
    (async () => {
      await clickWhenEnabled(page, log, payButton);
      if (afterPay.length === 0) return;
      // The next page renders after the click; fillFields waits for each field to show up.
      log.info("Waiting for the next page to fill the remaining fields");
      await fillFields(page, log, site, afterPay);
      await page.bringToFront();
    })().catch((error) => {
      log.warn({ err: error, click: payButton.label }, "Button not clicked");
    });
  }
}

/** Waits until the button is enabled (e.g. after the user solves a captcha), then clicks it. */
async function clickWhenEnabled(page: Page, log: Logger, action: ClickDefinition) {
  const button = action.locate(page);
  const deadline = Date.now() + USER_ACTION_TIMEOUT_MS;
  await button.waitFor({ state: "visible", timeout: USER_ACTION_TIMEOUT_MS });
  log.debug({ click: action.label }, "Waiting for button to be enabled");
  while (Date.now() < deadline) {
    if ((await button.isEnabled()) && (!action.readyWhen || (await action.readyWhen(page)))) {
      await button.click();
      log.info({ click: action.label }, "Clicked");
      await page.bringToFront();
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("timed out waiting for the button to be enabled");
}
