import { type FieldDefinition, type SiteDefinition, sites } from "./sites";

export interface ResolvedField {
  field: FieldDefinition;
  envName: string;
  value: string | undefined;
}

export interface ResolvedSite {
  site: SiteDefinition;
  fields: ResolvedField[];
}

export interface Config {
  browserChannel: string;
  sites: ResolvedSite[];
}

// Bun loads .env into process.env automatically.
export function loadConfig(env = process.env): Config {
  const requested = (env.SITES ?? "")
    .split(",")
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);

  if (requested.length === 0) {
    throw new Error("SITES is empty. Set it in .env, e.g. SITES=altofaro");
  }

  const known = new Map(sites.map((site) => [site.key, site]));
  const unknown = requested.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown site(s) in SITES: ${unknown.join(", ")}. Available: ${[...known.keys()].join(", ")}`,
    );
  }

  const config: Config = {
    browserChannel: env.BROWSER_CHANNEL?.trim() || "chrome",
    sites: [...new Set(requested)].flatMap((key) => {
      const site = known.get(key);
      if (!site) return [];
      return [
        {
          site,
          fields: site.fields.map((field) => {
            const envName = `${key.toUpperCase()}_${field.envSuffix}`;
            return { field, envName, value: env[envName]?.trim() || undefined };
          }),
        },
      ];
    }),
  };

  const problems = config.sites.flatMap(({ fields }) =>
    fields.flatMap(({ field, envName, value }) => {
      if (value === undefined) return [];
      if (field.digitsOnly && !/^\d+$/.test(value))
        return [`${envName} must contain digits only (got "${value}")`];
      if (field.maxLength && value.length > field.maxLength)
        return [`${envName} is longer than ${field.maxLength} characters`];
      return [];
    }),
  );
  if (problems.length > 0) throw new Error(problems.join("\n  "));

  return config;
}
