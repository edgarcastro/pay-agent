import { openBrowser, prepareSite } from "./browser";
import { type Config, loadConfig } from "./config";

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Config error: ${(error as Error).message}`);
  process.exit(1);
}

const context = await openBrowser(config);

// Reuse the blank tab a persistent context opens with.
const [blank] = context.pages();

for (const site of config.sites) {
  await prepareSite(context, site);
}
if (blank && context.pages().length > 1) await blank.close();

console.log(
  "\nReview the details and complete the payment in the browser. Close it when you're done.",
);
await new Promise<void>((resolve) => context.on("close", () => resolve()));
