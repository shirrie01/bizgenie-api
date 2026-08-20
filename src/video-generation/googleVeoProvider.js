const {
  VideoProviderRejectedError,
  VideoProviderResponseError,
  VideoProviderTimeoutError,
  VideoProviderUnavailableError,
} = require("./errors");
const { VideoGenerationProvider } = require("./provider");

const GOOGLE_VEO_PROVIDER = "google-vertex-ai";
const GOOGLE_VEO_LOCATION = "us-central1";
const GOOGLE_VEO_NORMAL_MODEL = "veo-3.1-fast-generate-001";
const GOOGLE_VEO_PREMIUM_MODEL = "veo-3.1-generate-001";
const GOOGLE_VEO_MODELS = Object.freeze({
  normal: GOOGLE_VEO_NORMAL_MODEL,
  premium: GOOGLE_VEO_PREMIUM_MODEL,
});
const GOOGLE_VEO_NATIVE_AUDIO = false;
const GOOGLE_VEO_RESOLUTION = "720p";
const DEFAULT_TIMEOUT_MS = 30_000;

function modelForQuality(quality) {
  const model = GOOGLE_VEO_MODELS[quality];
  if (!model) throw new VideoProviderRejectedError();
  return model;
}

function escapeRegExp(value) { return value.replace(/[.*+?^()|[\]\\{}$]/g, "\\$&"); }

function dimensions(aspectRatio) {
  if (aspectRatio === "16:9") return { width: 1280, height: 720 };
  if (aspectRatio === "9:16") return { width: 720, height: 1280 };
  throw new VideoProviderRejectedError();
}

function providerImage(asset) {
  if (!asset || !/^gs:\/\/[^/]+\/.+/i.test(asset.location) || !["image/jpeg", "image/png"].includes(asset.mime_type)) {
    throw new VideoProviderRejectedError();
  }
  return { gcsUri: asset.location, mimeType: asset.mime_type };
}

function safeDiagnostics(response, payload) {
  const diagnostics = {};
  if (typeof response?.requestId === "string" && response.requestId.trim()) diagnostics.request_id = response.requestId.trim().slice(0, 256);
  const filtered = payload?.response?.raiMediaFilteredCount;
  if (Number.isInteger(filtered) && filtered >= 0) diagnostics.filtered_count = filtered;
  return Object.keys(diagnostics).length ? diagnostics : undefined;
}

function unwrap(response) {
  if (response && Object.hasOwn(response, "payload")) return response.payload;
  return response;
}

class GoogleVertexRestTransport {
  constructor({ accessTokenProvider, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (typeof accessTokenProvider !== "function") throw new TypeError("Google Vertex transport requires an access token provider");
    if (typeof fetchImpl !== "function") throw new TypeError("Google Vertex transport requires fetch");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new TypeError("Google Vertex transport timeout is invalid");
    this.accessTokenProvider = accessTokenProvider;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async post(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const token = await this.accessTokenProvider();
      if (typeof token !== "string" || !token.trim()) throw new VideoProviderUnavailableError();
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response?.ok) {
        if ([400, 422].includes(response?.status)) throw new VideoProviderRejectedError();
        throw new VideoProviderUnavailableError();
      }
      let payload;
      try { payload = await response.json(); } catch (_error) { throw new VideoProviderResponseError(); }
      return { payload, requestId: response.headers?.get?.("x-request-id") || undefined };
    } catch (error) {
      if (error instanceof VideoProviderRejectedError || error instanceof VideoProviderResponseError || error instanceof VideoProviderUnavailableError) throw error;
      if (error?.name === "AbortError") throw new VideoProviderTimeoutError();
      throw new VideoProviderUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }
}

class GoogleVertexVeoProvider extends VideoGenerationProvider {
  constructor({ projectId, outputStorageUri, transport, location = GOOGLE_VEO_LOCATION } = {}) {
    super();
    if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw new TypeError("Google Veo requires a valid project ID");
    if (location !== GOOGLE_VEO_LOCATION) throw new TypeError("Google Veo is approved only in us-central1");
    if (typeof outputStorageUri !== "string" || !/^gs:\/\/[^/]+(?:\/.*)?\/$/i.test(outputStorageUri)) throw new TypeError("Google Veo requires a Cloud Storage output prefix");
    if (!transport || typeof transport.post !== "function") throw new TypeError("Google Veo requires a transport");
    this.projectId = projectId;
    this.outputStorageUri = outputStorageUri;
    this.transport = transport;
    this.location = location;
  }

  base(model) {
    return `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}`;
  }

  endpoint(model, method) {
    return `https://${this.location}-aiplatform.googleapis.com/v1/${this.base(model)}:${method}`;
  }

  operationPattern(model) {
    return new RegExp(`^${escapeRegExp(this.base(model))}/operations/[A-Za-z0-9._-]+$`);
  }

  costEvidence(operationName, model, transactionCorrelationId) {
    return {
      provider_operation_id: operationName,
      provider_model: model,
      ...(transactionCorrelationId ? { transaction_correlation_id: transactionCorrelationId } : {}),
    };
  }

  async submit({ prompt, quality, aspect_ratio: aspectRatio, duration_seconds: durationSeconds, input_image: inputImage, reference_assets: referenceAssets = [], metadata = {} } = {}) {
    const model = modelForQuality(quality);
    dimensions(aspectRatio);
    if (typeof prompt !== "string" || !prompt.trim() || ![4, 6, 8].includes(durationSeconds) || !Array.isArray(referenceAssets) || referenceAssets.length > 3 || (inputImage && referenceAssets.length) || (referenceAssets.length && durationSeconds !== 8)) {
      throw new VideoProviderRejectedError();
    }
    const instance = { prompt: prompt.trim() };
    let task = "textToVideo";
    if (inputImage) {
      instance.image = providerImage(inputImage);
      task = "imageToVideo";
    } else if (referenceAssets.length) {
      instance.referenceImages = referenceAssets.map((asset) => ({ image: providerImage(asset), referenceType: "asset" }));
      task = "referenceToVideo";
    }
    const body = {
      instances: [instance],
      parameters: {
        storageUri: this.outputStorageUri,
        sampleCount: 1,
        aspectRatio,
        durationSeconds,
        resolution: GOOGLE_VEO_RESOLUTION,
        generateAudio: GOOGLE_VEO_NATIVE_AUDIO,
        task,
      },
    };
    const response = await this.transport.post(this.endpoint(model, "predictLongRunning"), body);
    const payload = unwrap(response);
    const operationName = payload?.name;
    if (typeof operationName !== "string" || !this.operationPattern(model).test(operationName)) throw new VideoProviderResponseError();
    return {
      provider: GOOGLE_VEO_PROVIDER,
      provider_job_id: operationName,
      provider_model: model,
      diagnostics: safeDiagnostics(response, payload),
      cost_evidence: this.costEvidence(operationName, model, metadata.transaction_correlation_id),
    };
  }

  async poll({ provider_job_id: operationName, quality, aspect_ratio: aspectRatio, duration_seconds: durationSeconds, transaction_correlation_id: transactionCorrelationId } = {}) {
    const model = modelForQuality(quality);
    const size = dimensions(aspectRatio);
    if (![4, 6, 8].includes(durationSeconds) || typeof operationName !== "string" || !this.operationPattern(model).test(operationName)) throw new VideoProviderRejectedError();
    const response = await this.transport.post(this.endpoint(model, "fetchPredictOperation"), { operationName });
    const payload = unwrap(response);
    if (!payload || payload.name !== operationName || typeof payload.done !== "boolean") throw new VideoProviderResponseError();
    const common = {
      provider: GOOGLE_VEO_PROVIDER,
      provider_job_id: operationName,
      provider_model: model,
      diagnostics: safeDiagnostics(response, payload),
      cost_evidence: this.costEvidence(operationName, model, transactionCorrelationId),
    };
    if (!payload.done) return { ...common, status: "processing" };
    if (payload.error) return { ...common, status: "failed", error_code: "VIDEO_PROVIDER_FAILED" };
    const video = payload.response?.videos?.[0];
    const gcsUri = video?.gcsUri || payload.response?.gcsUris?.[0];
    const mimeType = video?.mimeType || "video/mp4";
    if (typeof gcsUri !== "string" || !/^gs:\/\/[^/]+\/.+/i.test(gcsUri) || mimeType !== "video/mp4") throw new VideoProviderResponseError();
    return {
      ...common,
      status: "completed",
      asset_source: {
        location: gcsUri,
        mime_type: "video/mp4",
        width: size.width,
        height: size.height,
        duration_seconds: durationSeconds,
        container: "mp4",
      },
    };
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  GOOGLE_VEO_LOCATION,
  GOOGLE_VEO_MODELS,
  GOOGLE_VEO_NATIVE_AUDIO,
  GOOGLE_VEO_NORMAL_MODEL,
  GOOGLE_VEO_PREMIUM_MODEL,
  GOOGLE_VEO_PROVIDER,
  GOOGLE_VEO_RESOLUTION,
  GoogleVertexRestTransport,
  GoogleVertexVeoProvider,
  modelForQuality,
};
