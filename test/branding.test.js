const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const {
  BrandingConfigSchema,
  brandingConfig,
  loadBrandingConfig,
} = require("../src/config/branding");

describe("branding configuration", () => {
  it("exposes every branding concern through one validated contract", () => {
    assert.equal(brandingConfig.appName, "BizGenie");
    assert.deepEqual(Object.keys(brandingConfig).sort(), [
      "appName",
      "colors",
      "copyright",
      "favicon",
      "legalName",
      "logo",
      "marketingStrings",
      "supportEmail",
      "urls",
    ]);
    assert.equal(
      BrandingConfigSchema.safeParse(brandingConfig).success,
      true
    );
  });

  it("preserves the existing service response by default", async () => {
    const response = await request(createApp()).get("/");

    assert.equal(response.status, 200);
    assert.equal(response.text, "BizGenie Cloud Run is up");
  });

  it("applies partial runtime overrides without losing default strings", async () => {
    const branding = loadBrandingConfig({
      env: {
        BRANDING_CONFIG_JSON: JSON.stringify({
          appName: "Configured Brand",
          logo: "/assets/logo.svg",
          colors: {
            primary: "#112233",
          },
          favicon: "/assets/favicon.ico",
          legalName: "Configured Brand Limited",
          copyright: "Configured copyright",
          supportEmail: "support@example.com",
          urls: {
            marketing: "https://example.com",
            terms: "https://example.com/terms",
          },
          marketingStrings: {
            serviceStatus: "Configured service is up",
            tagline: "Configured marketing tagline",
          },
        }),
      },
    });

    assert.equal(branding.appName, "Configured Brand");
    assert.equal(branding.colors.primary, "#112233");
    assert.equal(branding.marketingStrings.apiBooting, "BizGenie API booting");
    assert.equal(
      branding.marketingStrings.tagline,
      "Configured marketing tagline"
    );

    const response = await request(createApp({ branding })).get("/");
    assert.equal(response.text, "Configured service is up");
  });

  it("fails fast for malformed or invalid runtime configuration", () => {
    assert.throws(
      () =>
        loadBrandingConfig({
          env: { BRANDING_CONFIG_JSON: "{" },
        }),
      /Invalid BRANDING_CONFIG_JSON: must be valid JSON/
    );

    assert.throws(
      () =>
        loadBrandingConfig({
          env: {
            BRANDING_CONFIG_JSON: JSON.stringify({
              supportEmail: "not-an-email",
            }),
          },
        }),
      /Invalid BRANDING_CONFIG_JSON: supportEmail/
    );
  });

  it("returns immutable configuration", () => {
    const branding = loadBrandingConfig();

    assert.equal(Object.isFrozen(branding), true);
    assert.equal(Object.isFrozen(branding.colors), true);
    assert.equal(Object.isFrozen(branding.urls), true);
    assert.equal(Object.isFrozen(branding.marketingStrings), true);
  });
});
