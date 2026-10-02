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
}

export interface ClickDefinition {
  /** Human-readable name used in logs. */
  label: string;
  locate: (page: Page) => Locator;
}

export interface SiteDefinition {
  key: string;
  name: string;
  url: string;
  fields: FieldDefinition[];
  /** Elements clicked in order after the fields are filled. */
  clicks?: ClickDefinition[];
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
];
