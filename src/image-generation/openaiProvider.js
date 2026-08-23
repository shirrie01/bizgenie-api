const {
  ImageProviderRejectedError,
  ImageProviderResponseError,
  ImageProviderTimeoutError,
  ImageProviderUnavailableError,
} = require("./errors");
const { ImageGenerationProvider } = require("./provider");
const {
  MAX_REFERENCE_ASSETS,
  NormalizedImageAssetSchema,
} = require("./schema");

const OPENAI_IMAGE_PROVIDER = "openai";
const OPENAI_IMAGE_MODEL = "gpt-image-2-2026-04-21";
const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 150_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_QUALITY = "medium";
const DEFAULT_OUTPUT_FORMAT = "jpeg";
const DEFAULT_OUTPUT_COMPRESSION = 90;
const DEFAULT_MODERATION = "auto";
const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

const ALLOWED_QUALITIES = new Set(["low", "medium", "high"]);
const ALLOWED_OUTPUT_FORMATS = new Set(["jpeg", "png", "webp"]);
const ALLOWED_REFERENCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ASPECT_RATIO_OUTPUTS = Object.freeze({
  "1:1": Object.freeze({ size: "1024x1024", width: 1024, height: 1024 }),
  "4:5": Object.freeze({ size: "1024x1280", width: 1024, height: 1280 }),
  "9:16": Object.freeze({ size: "1152x2048", width: 1152, height: 2048 }),
  "16:9": Object.freeze({ size: "2048x1152", width: 2048, height: 1152 }),
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requireDependency(value, method, name) {
  if (!value || typeof value[method] !== "function") {
    throw new TypeError(`${name} must implement ${method}()`);
  }
  return value;
}

function requireInteger(value, { name, minimum, maximum }) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

function validateConfiguration({
  apiKey,
  model,
  quality,
  outputFormat,
  outputCompression,
  moderation,
  timeoutMs,
  maxAttempts,
}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new TypeError("OpenAI image generation requires an API key");
  }
  if (model !== OPENAI_IMAGE_MODEL) {
    throw new TypeError("The OpenAI image model is not approved");
  }
  if (!ALLOWED_QUALITIES.has(quality)) {
    throw new TypeError("The OpenAI image quality is not approved");
  }
  if (!ALLOWED_OUTPUT_FORMATS.has(outputFormat)) {
    throw new TypeError("The OpenAI image output format is not approved");
  }
  requireInteger(outputCompression, {
    name: "OpenAI image output compression",
    minimum: 0,
    maximum: 100,
  });
  if (moderation !== DEFAULT_MODERATION) {
    throw new TypeError("The OpenAI image moderation setting is not approved");
  }
  requireInteger(timeoutMs, {
    name: "OpenAI image timeout",
    minimum: 1,
    maximum: 300_000,
  });
  requireInteger(maxAttempts, {
    name: "OpenAI image maximum attempts",
    minimum: 1,
    maximum: 3,
  });
}

function mimeTypeFor(format) {
  return format === "jpg" ? "image/jpeg" : `image/${format}`;
}

function fileExtensionFor(mimeType) {
  return mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
}

function safeFilename(referenceAsset, mimeType) {
  const extension = fileExtensionFor(mimeType);
  const identifier = String(referenceAsset.asset_id || "reference")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 128);
  return `${identifier || "reference"}.${extension}`;
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  throw new ImageProviderRejectedError();
}

function validateLoadedReference(referenceAsset, loaded) {
  if (!loaded || typeof loaded !== "object") {
    throw new ImageProviderRejectedError();
  }
  const data = asBuffer(loaded.data);
  const mimeType = loaded.mime_type || referenceAsset.mime_type;
  if (
    !ALLOWED_REFERENCE_MIME_TYPES.has(mimeType) ||
    (referenceAsset.mime_type && referenceAsset.mime_type !== mimeType) ||
    data.length === 0 ||
    data.length > MAX_REFERENCE_BYTES
  ) {
    throw new ImageProviderRejectedError();
  }
  return {
    data,
    mime_type: mimeType,
    filename: safeFilename(referenceAsset, mimeType),
  };
}

function parseOptionalInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return Number(value);
}

function decodeBase64Image(encoded) {
  const compact = encoded.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new ImageProviderResponseError();
  }
  const data = Buffer.from(compact, "base64");
  const normalizedInput = compact.replace(/=+$/, "");
  const normalizedOutput = data.toString("base64").replace(/=+$/, "");
  if (
    !data.length ||
    data.length > MAX_OUTPUT_BYTES ||
    normalizedInput !== normalizedOutput
  ) {
    throw new ImageProviderResponseError();
  }
  return data;
}

function sanitizeLineage(metadata = {}) {
  const lineage = {};
  for (const field of [
    "generation_id",
    "execution_id",
    "user_id",
    "tenant_id",
    "generation_job_id",
    "project_id",
    "brand_id",
    "campaign_id",
    "content_item_id",
  ]) {
    if (typeof metadata[field] === "string" && metadata[field]) {
      lineage[field] = metadata[field];
    }
  }
  return lineage;
}

function isTransientStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function mapNonTransientResponse(status) {
  if ([400, 403, 422].includes(status)) {
    return new ImageProviderRejectedError();
  }
  return new ImageProviderUnavailableError();
}

class OpenAIImageProvider extends ImageGenerationProvider {
  constructor({
    apiKey,
    assetStore,
    referenceAssetLoader,
    fetchImpl = globalThis.fetch,
    sleepImpl = sleep,
    model = OPENAI_IMAGE_MODEL,
    quality = DEFAULT_QUALITY,
    outputFormat = DEFAULT_OUTPUT_FORMAT,
    outputCompression = DEFAULT_OUTPUT_COMPRESSION,
    moderation = DEFAULT_MODERATION,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = {}) {
    super();
    validateConfiguration({
      apiKey,
      model,
      quality,
      outputFormat,
      outputCompression,
      moderation,
      timeoutMs,
      maxAttempts,
    });
    if (typeof fetchImpl !== "function") {
      throw new TypeError("OpenAI image generation requires fetch");
    }
    if (typeof sleepImpl !== "function") {
      throw new TypeError("OpenAI image generation requires a sleep function");
    }
    requireInteger(retryDelayMs, {
      name: "OpenAI image retry delay",
      minimum: 0,
      maximum: 5_000,
    });

    this.apiKey = apiKey;
    this.assetStore = requireDependency(assetStore, "save", "Image asset store");
    this.referenceAssetLoader = requireDependency(
      referenceAssetLoader,
      "load",
      "Reference asset loader"
    );
    this.fetchImpl = fetchImpl;
    this.sleepImpl = sleepImpl;
    this.model = model;
    this.quality = quality;
    this.outputFormat = outputFormat;
    this.outputCompression = outputCompression;
    this.moderation = moderation;
    this.timeoutMs = timeoutMs;
    this.maxAttempts = maxAttempts;
    this.retryDelayMs = retryDelayMs;
  }

  async loadReferences(referenceAssets) {
    const loaded = [];
    for (const referenceAsset of referenceAssets) {
      try {
        loaded.push(
          validateLoadedReference(
            referenceAsset,
            await this.referenceAssetLoader.load(referenceAsset)
          )
        );
      } catch (error) {
        if (error instanceof ImageProviderRejectedError) {
          throw error;
        }
        throw new ImageProviderRejectedError();
      }
    }
    return loaded;
  }

  generationRequest(prompt, output) {
    const body = {
      model: this.model,
      prompt,
      size: output.size,
      quality: this.quality,
      output_format: this.outputFormat,
      moderation: this.moderation,
      n: 1,
    };
    if (["jpeg", "webp"].includes(this.outputFormat)) {
      body.output_compression = this.outputCompression;
    }

    return () => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  editRequest(prompt, output, references) {
    return () => {
      const body = new FormData();
      body.append("model", this.model);
      body.append("prompt", prompt);
      body.append("size", output.size);
      body.append("quality", this.quality);
      body.append("output_format", this.outputFormat);
      body.append("moderation", this.moderation);
      body.append("n", "1");
      if (["jpeg", "webp"].includes(this.outputFormat)) {
        body.append("output_compression", String(this.outputCompression));
      }
      for (const reference of references) {
        body.append(
          "image[]",
          new Blob([reference.data], { type: reference.mime_type }),
          reference.filename
        );
      }

      return {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body,
      };
    };
  }

  async fetchAttempt(url, createInit) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        ...createInit(),
        signal: controller.signal,
      });
      return { response };
    } catch (_error) {
      return { timedOut, networkFailure: !timedOut };
    } finally {
      clearTimeout(timer);
    }
  }

  async request(url, createInit) {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const result = await this.fetchAttempt(url, createInit);
      const shouldRetry =
        result.timedOut ||
        result.networkFailure ||
        isTransientStatus(result.response?.status);

      if (shouldRetry && attempt < this.maxAttempts) {
        await this.sleepImpl(this.retryDelayMs * attempt);
        continue;
      }
      if (result.timedOut) {
        throw new ImageProviderTimeoutError();
      }
      if (result.networkFailure || isTransientStatus(result.response?.status)) {
        throw new ImageProviderUnavailableError();
      }
      if (!result.response?.ok) {
        throw mapNonTransientResponse(result.response?.status);
      }
      return result.response;
    }

    throw new ImageProviderUnavailableError();
  }

  async parseResponse(response) {
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new ImageProviderResponseError();
    }

    const encoded = payload?.data?.[0]?.b64_json;
    const requestId = response.headers?.get?.("x-request-id");
    if (typeof encoded !== "string" || !encoded || !requestId) {
      throw new ImageProviderResponseError();
    }

    const data = decodeBase64Image(encoded);
    return { data, requestId };
  }

  async persistAsset({ data, requestId, output, metadata }) {
    const mimeType = mimeTypeFor(this.outputFormat);
    let stored;
    try {
      stored = await this.assetStore.save({
        data,
        mime_type: mimeType,
        width: output.width,
        height: output.height,
        extension: fileExtensionFor(mimeType),
        lineage: {
          ...sanitizeLineage(metadata),
          provider: OPENAI_IMAGE_PROVIDER,
          provider_job_id: requestId,
          model: this.model,
        },
      });
    } catch (_error) {
      throw new ImageProviderUnavailableError();
    }

    const parsed = NormalizedImageAssetSchema.safeParse({
      ...(stored?.asset_id ? { asset_id: stored.asset_id } : {}),
      location: stored?.location,
      mime_type: mimeType,
      width: output.width,
      height: output.height,
    });
    if (!parsed.success) {
      throw new ImageProviderResponseError();
    }
    return parsed.data;
  }

  async generate({
    prompt,
    aspect_ratio: aspectRatio,
    reference_assets: referenceAssets = [],
    metadata = {},
  } = {}) {
    if (
      typeof prompt !== "string" ||
      !prompt.trim() ||
      !ASPECT_RATIO_OUTPUTS[aspectRatio] ||
      !Array.isArray(referenceAssets) ||
      referenceAssets.length > MAX_REFERENCE_ASSETS
    ) {
      throw new ImageProviderRejectedError();
    }

    const output = ASPECT_RATIO_OUTPUTS[aspectRatio];
    const references = referenceAssets.length
      ? await this.loadReferences(referenceAssets)
      : [];
    const endpoint = references.length ? "images/edits" : "images/generations";
    const createInit = references.length
      ? this.editRequest(prompt, output, references)
      : this.generationRequest(prompt, output);
    const response = await this.request(
      `${OPENAI_API_BASE_URL}/${endpoint}`,
      createInit
    );
    const { data, requestId } = await this.parseResponse(response);
    const asset = await this.persistAsset({
      data,
      requestId,
      output,
      metadata,
    });

    return {
      provider: OPENAI_IMAGE_PROVIDER,
      provider_job_id: requestId,
      asset,
    };
  }
}

function createOpenAIImageProviderFromEnv({
  env = process.env,
  assetStore,
  referenceAssetLoader,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
} = {}) {
  return new OpenAIImageProvider({
    apiKey: env.OPENAI_API_KEY,
    assetStore,
    referenceAssetLoader,
    fetchImpl,
    sleepImpl,
    quality: env.OPENAI_IMAGE_QUALITY || DEFAULT_QUALITY,
    outputFormat: env.OPENAI_IMAGE_OUTPUT_FORMAT || DEFAULT_OUTPUT_FORMAT,
    outputCompression: parseOptionalInteger(
      env.OPENAI_IMAGE_OUTPUT_COMPRESSION,
      DEFAULT_OUTPUT_COMPRESSION
    ),
    timeoutMs: parseOptionalInteger(
      env.OPENAI_IMAGE_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
    maxAttempts: parseOptionalInteger(
      env.OPENAI_IMAGE_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS
    ),
    retryDelayMs: parseOptionalInteger(
      env.OPENAI_IMAGE_RETRY_DELAY_MS,
      DEFAULT_RETRY_DELAY_MS
    ),
  });
}

module.exports = {
  ALLOWED_OUTPUT_FORMATS,
  ALLOWED_QUALITIES,
  ASPECT_RATIO_OUTPUTS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MODERATION,
  DEFAULT_OUTPUT_COMPRESSION,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_QUALITY,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
  MAX_REFERENCE_BYTES,
  MAX_OUTPUT_BYTES,
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_PROVIDER,
  OpenAIImageProvider,
  createOpenAIImageProviderFromEnv,
};
