import type { Locator, Page } from "playwright";

export interface FieldDefinition {
  /** Env var suffix; the value is read from `<SITE_KEY>_<envSuffix>`. */
  envSuffix: string;
  /** Human-readable name used in logs. */
  label: string;
  locate: (page: Page) => Locator;
  /** Only digits allowed (the site strips anything else). */
  digitsOnly?: boolean;
  /** Mirrors the input's `maxlength`. */
  maxLength?: number;
  /** Value is masked in logs (passwords). */
  secret?: boolean;
  /** Delay between keystrokes in ms (default 30); raise it for sites that drop fast keys. */
  typeDelayMs?: number;
}

export interface ClickDefinition {
  /** Human-readable name used in logs. */
  label: string;
  locate: (page: Page) => Locator;
  /** Skipped quietly if the element doesn't show up soon (e.g. a popup that may not appear). */
  optional?: boolean;
  /** For `clickWhenEnabled`: extra condition that must hold before clicking (e.g. captcha solved). */
  readyWhen?: (page: Page) => Promise<boolean>;
}

export interface SiteDefinition {
  key: string;
  name: string;
  url: string;
  fields: FieldDefinition[];
  /** Elements clicked in order before the fields are filled (e.g. to reveal the form). */
  steps?: ClickDefinition[];
  /** How long to wait for each field to appear; raise it when the user must navigate first. */
  fieldTimeoutMs?: number;
  /** Elements clicked in order after the fields are filled. */
  clicks?: ClickDefinition[];
  /**
   * A "Pagar" button that stays disabled until the user finishes something (e.g. a captcha).
   * Runs in the background: waits until it is enabled, then clicks it. Only for buttons named
   * pay/pagar; never for choosing a payment method or entering card/bank data.
   */
  clickWhenEnabled?: ClickDefinition;
  /** Navigation after the clicks, e.g. to a page behind a login. Skipped if the fill failed. */
  navigateAfter?: {
    /** Wait until the page URL satisfies this (e.g. the login redirect finished). */
    waitForUrl?: (url: URL) => boolean;
    goto: string;
  };
}

/** Matches an input by its exact id (ids on some sites contain spaces, so `#id` won't work). */
const byId = (id: string) => (page: Page) => page.locator(`input[id="${id}"]`);

export const sites: SiteDefinition[] = [
  {
    key: "property",
    name: "Property management (AvalPayCenter)",
    url: "https://www.avalpaycenter.com/wps/portal/portal-de-pagos/web/pagos-aval/resultado-busqueda/realizar-pago?idConv=00014552&origen=buscar",
    fields: [
      {
        envSuffix: "REFERENCE",
        label: "2 numero de apto numero de torre",
        locate: byId("2 numero de apto numero de torre"),
        digitsOnly: true,
        maxLength: 18,
      },
      {
        envSuffix: "AMOUNT",
        label: "Valor a pagar",
        locate: byId("valor a pagar"),
        digitsOnly: true,
        maxLength: 19,
      },
    ],
    clicks: [
      {
        label: "Otros medios de pago",
        locate: (page) => page.locator("p", { hasText: "Otros medios de pago:" }).first(),
      },
      {
        label: "Acepto",
        locate: (page) => page.locator("span", { hasText: "Acepto" }).first(),
      },
    ],
  },
  {
    key: "surtigas",
    name: "Surtigas (gas)",
    url: "https://surtigas.com.co/portal-de-recaudo/",
    fields: [
      {
        envSuffix: "CONTRACT",
        label: "Número de contrato",
        locate: byId("pesta_0_Digitar_contrato"),
        digitsOnly: true,
      },
    ],
    clicks: [
      {
        label: "Continuar",
        // The id is duplicated on the page (one per tab); only the active one is visible.
        locate: (page) => page.locator('input[id="btnIngresar"]:visible').first(),
      },
    ],
  },
  {
    key: "afinia",
    name: "Afinia (Caribemar)",
    url: "https://caribemar.facture.co/Login?returnurl=%2f",
    steps: [
      {
        // A promo modal can cover the page and block clicks on the login button.
        label: "Close promo modal",
        locate: (page) => page.locator("#myModal .closePopUp"),
        optional: true,
      },
    ],
    fields: [
      {
        envSuffix: "EMAIL",
        label: "Correo electrónico",
        locate: (page) => page.locator('input[id$="txtUsername"]'),
      },
      {
        envSuffix: "PASSWORD",
        label: "Contraseña",
        locate: (page) => page.locator('input[id$="txtPassword"]'),
        secret: true,
        // The field's onkeydown handler (IsValidKey) can drop keys typed too fast.
        typeDelayMs: 150,
      },
    ],
    clicks: [
      {
        label: "Ingresar",
        locate: (page) => page.locator('button[id$="cmdLogin"]'),
      },
    ],
    navigateAfter: {
      // Once the login redirects away from /Login, open the invoices (pay) section.
      waitForUrl: (url) => !url.pathname.toLowerCase().includes("/login"),
      goto: "https://caribemar.facture.co/Mis-Facturas#/",
    },
  },
  {
    key: "acuacar",
    name: "Acuacar",
    url: "https://acuacar.facture.co/gatewayacuacar/Pagar#/List",
    // The Angular app may need a manual step before the form shows up.
    fieldTimeoutMs: 120_000,
    fields: [
      {
        envSuffix: "POLICY",
        label: "Número de póliza",
        locate: (page) => page.locator('input[name="numeroContrato"]'),
        // The site accepts digits with an optional comma (e.g. "123,456"), so no digitsOnly.
        maxLength: 100,
      },
    ],
    // Enabled only after the user solves the reCAPTCHA.
    clickWhenEnabled: {
      label: "Pagar",
      // Two buttons share the "Pagar" label; the one to press is the last.
      locate: (page) => page.locator('button[aria-label="Pagar"]').last(),
      // The reCAPTCHA appears late; its hidden textarea gets a token once the user solves it.
      readyWhen: async (page) =>
        (await page.locator("#gcaptchacontrato textarea.g-recaptcha-response").inputValue()) !== "",
    },
  },
];
