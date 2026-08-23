const { resolveBrandBrainContext } = require("../brand-brain");
const {
  VideoAssetPersistenceError,
  VideoContextUnavailableError,
  VideoGenerationError,
  VideoGenerationInternalError,
  VideoGenerationNotFoundError,
  VideoProviderOperationFailedError,
  VideoProviderUnavailableError,
  VideoReferenceAssetUnavailableError,
} = require("./errors");
const { compileVideoPrompt } = require("./promptCompiler");
const { normalizePoll, normalizeSubmission } = require("./provider");
const {
  NormalizedVideoAssetSchema,
  ResolvedVideoInputImageSchema,
  VideoGenerationRequestSchema,
} = require("./schema");

const VIDEO_REFERENCE_RIGHT = "video.generate.reference";

class VideoGenerationService {
  constructor({ repository, provider, assetStore, referenceAssetLoader, brandBrainRepository, now = () => new Date() }) {
    if (!repository || !provider || !assetStore || !referenceAssetLoader || !brandBrainRepository) {
      throw new Error("Video generation requires repository, provider, asset store, reference asset loader, and Brand Brain repository dependencies");
    }
    this.repository = repository;
    this.provider = provider;
    this.assetStore = assetStore;
    this.referenceAssetLoader = referenceAssetLoader;
    this.brandBrainRepository = brandBrainRepository;
    this.now = now;
  }

  timestamp() { return this.now().toISOString(); }

  get(generationId) {
    const record = this.repository.getByGenerationId(generationId);
    if (!record) throw new VideoGenerationNotFoundError(generationId);
    return record;
  }

  markFailed(generationId, code) {
    const record = this.repository.getByGenerationId(generationId);
    if (!record || ["completed", "failed"].includes(record.status)) return record;
    const completedAt = this.timestamp();
    try {
      return this.repository.update(generationId, {
        status: "failed",
        error_code: code,
        updated_at: completedAt,
        completed_at: completedAt,
      });
    } catch (_error) {
      return null;
    }
  }

  async resolveContext(request) {
    try {
      return await resolveBrandBrainContext({
        repository: this.brandBrainRepository,
        projectId: request.project_id,
        brandId: request.brand_id,
        generationContext: { platform: request.platform, mediaType: "video" },
      });
    } catch (_error) {
      throw new VideoContextUnavailableError();
    }
  }

  async resolveReferenceAsset(asset, request, usage) {
    let loaded;
    try {
      loaded = await this.referenceAssetLoader.load({
        asset_id: asset.asset_id,
        ...(request.tenant_id ? { tenant_id: request.tenant_id } : {}),
        project_id: request.project_id,
        requested_by_user_id: request.user_id,
        required_right: VIDEO_REFERENCE_RIGHT,
        usage,
        generation_id: request.generation_id,
        execution_id: request.execution_id,
      });
    } catch (error) {
      if (error instanceof VideoReferenceAssetUnavailableError) throw error;
      throw new VideoReferenceAssetUnavailableError();
    }
    const parsed = ResolvedVideoInputImageSchema.safeParse(loaded);
    if (!parsed.success || parsed.data.asset_id !== asset.asset_id) {
      throw new VideoReferenceAssetUnavailableError();
    }
    return parsed.data;
  }

  async resolveProviderInputs(request) {
    if (request.input_image) {
      return {
        inputImage: await this.resolveReferenceAsset(request.input_image, request, "input_image"),
        referenceAssets: [],
      };
    }
    const referenceAssets = [];
    for (const asset of request.reference_assets || []) {
      referenceAssets.push(await this.resolveReferenceAsset(asset, request, "reference_asset"));
    }
    return { inputImage: undefined, referenceAssets };
  }

  async submit(value, { job } = {}) {
    const request = VideoGenerationRequestSchema.parse(value);
    if (
      job &&
      (job.project_id !== request.project_id ||
        job.actor_correlation?.auth_user_id !== request.user_id)
    ) {
      throw new VideoGenerationInternalError();
    }
    const authorizedRequest = {
      ...request,
      ...(job ? { tenant_id: job.tenant_id } : {}),
    };
    const createdAt = this.timestamp();
    this.repository.create({
      generation_id: request.generation_id,
      parent_generation_id: request.parent_generation_id,
      transaction_correlation_id: request.transaction_correlation_id,
      execution_id: request.execution_id,
      user_id: request.user_id,
      ...(job ? { tenant_id: job.tenant_id, generation_job_id: job.job_id } : {}),
      project_id: request.project_id,
      brand_id: request.brand_id,
      campaign_id: request.campaign_id,
      content_item_id: request.content_item_id,
      video_purpose: request.video_purpose,
      quality: request.quality,
      aspect_ratio: request.aspect_ratio,
      duration_seconds: request.duration_seconds,
      status: "queued",
      created_at: createdAt,
      updated_at: createdAt,
    });

    try {
      const brandContext = await this.resolveContext(request);
      const { inputImage, referenceAssets } = await this.resolveProviderInputs(authorizedRequest);
      const prompt = compileVideoPrompt({
        ...request,
        input_image: inputImage,
        reference_assets: referenceAssets,
      }, { brandContext });
      let result;
      try {
        result = normalizeSubmission(await this.provider.submit({
          prompt,
          quality: request.quality,
          aspect_ratio: request.aspect_ratio,
          duration_seconds: request.duration_seconds,
          input_image: inputImage,
          reference_assets: referenceAssets,
          metadata: {
            generation_id: request.generation_id,
            execution_id: request.execution_id,
            user_id: request.user_id,
            ...(job ? {
              tenant_id: job.tenant_id,
              generation_job_id: job.job_id,
            } : {}),
            project_id: request.project_id,
            brand_id: request.brand_id,
            campaign_id: request.campaign_id,
            content_item_id: request.content_item_id,
            transaction_correlation_id: request.transaction_correlation_id,
          },
        }));
      } catch (error) {
        if (error instanceof VideoGenerationError) throw error;
        throw new VideoProviderUnavailableError();
      }

      return this.repository.update(request.generation_id, {
        status: "submitted",
        provider: result.provider,
        provider_job_id: result.provider_job_id,
        provider_model: result.provider_model,
        provider_diagnostics: result.diagnostics,
        provider_cost_evidence: result.cost_evidence,
        updated_at: this.timestamp(),
      });
    } catch (error) {
      const safeError = error instanceof VideoGenerationError ? error : new VideoGenerationInternalError();
      this.markFailed(request.generation_id, safeError.code);
      throw safeError;
    }
  }

  async persistCompletedAsset(record, result) {
    let stored;
    try {
      stored = await this.assetStore.save({
        source: result.asset_source,
        lineage: {
          generation_id: record.generation_id,
          parent_generation_id: record.parent_generation_id,
          execution_id: record.execution_id,
          user_id: record.user_id,
          tenant_id: record.tenant_id,
          generation_job_id: record.generation_job_id,
          project_id: record.project_id,
          brand_id: record.brand_id,
          campaign_id: record.campaign_id,
          content_item_id: record.content_item_id,
          transaction_correlation_id: record.transaction_correlation_id,
          provider: record.provider,
          provider_job_id: record.provider_job_id,
          provider_model: record.provider_model,
        },
      });
    } catch (_error) {
      throw new VideoAssetPersistenceError();
    }
    const parsed = NormalizedVideoAssetSchema.safeParse(stored);
    if (!parsed.success) throw new VideoAssetPersistenceError();
    return parsed.data;
  }

  async poll(generationId) {
    let record = this.get(generationId);
    if (["completed", "failed"].includes(record.status)) return record;
    if (!record.provider_job_id) throw new VideoGenerationInternalError();

    if (record.status === "submitted") {
      record = this.repository.update(generationId, { status: "processing", updated_at: this.timestamp() });
    }

    let result;
    try {
      result = normalizePoll(await this.provider.poll({
        provider_job_id: record.provider_job_id,
        quality: record.quality,
        aspect_ratio: record.aspect_ratio,
        duration_seconds: record.duration_seconds,
        transaction_correlation_id: record.transaction_correlation_id,
      }));
    } catch (error) {
      if (error instanceof VideoGenerationError) throw error;
      throw new VideoProviderUnavailableError();
    }

    if (result.provider_job_id !== record.provider_job_id || result.provider !== record.provider || result.provider_model !== record.provider_model) {
      throw new VideoGenerationInternalError();
    }
    if (result.status === "processing") {
      return this.repository.update(generationId, {
        provider_diagnostics: result.diagnostics || record.provider_diagnostics,
        provider_cost_evidence: result.cost_evidence || record.provider_cost_evidence,
        updated_at: this.timestamp(),
      });
    }
    if (result.status === "failed") {
      this.markFailed(generationId, result.error_code);
      throw new VideoProviderOperationFailedError();
    }

    const asset = await this.persistCompletedAsset(record, result);
    const completedAt = this.timestamp();
    return this.repository.update(generationId, {
      status: "completed",
      approval_status: "pending",
      asset,
      provider_diagnostics: result.diagnostics || record.provider_diagnostics,
      provider_cost_evidence: result.cost_evidence || record.provider_cost_evidence,
      updated_at: completedAt,
      completed_at: completedAt,
    });
  }
}

module.exports = { VideoGenerationService };
