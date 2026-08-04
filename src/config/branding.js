const { z } = require("zod");
const defaultBranding = require("../../config/branding.json");

const NonEmptyString = z.string().trim().min(1);
const NullableString = NonEmptyString.nullable();

const BrandingConfigSchema = z
  .object({
    appName: NonEmptyString,
    logo: NullableString,
    colors: z.record(z.string(), NonEmptyString),
    favicon: NullableString,
    legalName: NullableString,
    copyright: NullableString,
    supportEmail: z.string().trim().email().nullable(),
    urls: z.record(z.string(), z.string().trim().url()),
    marketingStrings: z
      .object({
        apiBooting: NonEmptyString,
        serviceStatus: NonEmptyString,
      })
      .catchall(NonEmptyString),
  })
  .strict();

const BrandingOverridesSchema = z
  .object({
    appName: NonEmptyString.optional(),
    logo: NullableString.optional(),
    colors: z.record(z.string(), NonEmptyString).optional(),
    favicon: NullableString.optional(),
    legalName: NullableString.optional(),
    copyright: NullableString.optional(),
    supportEmail: z.string().trim().email().nullable().optional(),
    urls: z.record(z.string(), z.string().trim().url()).optional(),
    marketingStrings: z.record(z.string(), NonEmptyString).optional(),
  })
  .strict();

function formatIssues(issues) {
  return issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseBrandingOverrides(rawValue) {
  if (!rawValue) {
    return {};
  }

  let value;
  try {
    value = JSON.parse(rawValue);
  } catch {
    throw new Error("Invalid BRANDING_CONFIG_JSON: must be valid JSON");
  }

  const parsed = BrandingOverridesSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Invalid BRANDING_CONFIG_JSON: ${formatIssues(parsed.error.issues)}`
    );
  }

  return parsed.data;
}

function deepFreeze(value) {
  Object.freeze(value);

  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }

  return value;
}

function loadBrandingConfig({
  env = process.env,
  baseConfig = defaultBranding,
} = {}) {
  const parsedBase = BrandingConfigSchema.safeParse(baseConfig);
  if (!parsedBase.success) {
    throw new Error(
      `Invalid config/branding.json: ${formatIssues(parsedBase.error.issues)}`
    );
  }

  const overrides = parseBrandingOverrides(env.BRANDING_CONFIG_JSON);
  const merged = {
    ...parsedBase.data,
    ...overrides,
    colors: {
      ...parsedBase.data.colors,
      ...overrides.colors,
    },
    urls: {
      ...parsedBase.data.urls,
      ...overrides.urls,
    },
    marketingStrings: {
      ...parsedBase.data.marketingStrings,
      ...overrides.marketingStrings,
    },
  };

  return deepFreeze(BrandingConfigSchema.parse(merged));
}

const brandingConfig = loadBrandingConfig();

module.exports = {
  BrandingConfigSchema,
  brandingConfig,
  loadBrandingConfig,
};
