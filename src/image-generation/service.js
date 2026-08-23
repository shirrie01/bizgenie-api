const { resolveBrandBrainContext } = require("../brand-brain");
const {
  ImageContextUnavailableError,
  ImageGenerationError,
  ImageGenerationInternalError,
  ImageProviderUnavailableError,
} = require("./errors");
const { compileImagePrompt } = require("./promptCompiler");
const { normalizeProviderResult } = require("./provider");
const { ImageGenerationRequestSchema } = require("./schema");

const IMAGE_REFERENCE_RIGHT = "image.generate.reference";

class ImageGenerationService {
  constructor({
    repository,
    provider,
    brandBrainRepository,
    now = () => new Date(),
  }) {
    if (!repository || !provider || !brandBrainRepository) {
      throw new Error(
        "Image generation requires repository, provider, and Brand Brain repository dependencies"
      );
    }
    this.repository = repository;
    this.provider = provider;
    this.brandBrainRepository = brandBrainRepository;
    this.now = now;
  }

  timestamp() {
    return this.now().toISOString();
  }

  markFailed(generationId, code) {
    const completedAt = this.timestamp();
    try {
      this.repository.update(generationId, {
        status: "failed",
        error_code: code,
        updated_at: completedAt,
        completed_at: completedAt,
      });
    } catch (_error) {
      // Never replace the safe generation error with persistence diagnostics.
    }
  }

  async resolveContext(request) {
    try {
      return await resolveBrandBrainContext({
        repository: this.brandBrainRepository,
        projectId: request.project_id,
        brandId: request.brand_id,
        generationContext: {
          platform: request.platform,
          mediaType: "image",
        },
      });
    } catch (_error) {
      throw new ImageContextUnavailableError();
    }
  }

  async callProvider(providerRequest) {
    try {
      return normalizeProviderResult(await this.provider.generate(providerRequest));
    } catch (error) {
      if (error instanceof ImageGenerationError) {
        throw error;
      }
      throw new ImageProviderUnavailableError();
    }
  }

  async generate(value, { job } = {}) {
    const request = ImageGenerationRequestSchema.parse(value);
    if (
      job &&
      (job.project_id !== request.project_id ||
        job.actor_correlation?.auth_user_id !== request.user_id)
    ) {
      throw new ImageGenerationInternalError();
    }
    const createdAt = this.timestamp();
    this.repository.create({
      generation_id: request.generation_id,
      parent_generation_id: request.parent_generation_id,
      execution_id: request.execution_id,
      user_id: request.user_id,
      ...(job ? { tenant_id: job.tenant_id, generation_job_id: job.job_id } : {}),
      project_id: request.project_id,
      brand_id: request.brand_id,
      campaign_id: request.campaign_id,
      content_item_id: request.content_item_id,
      image_purpose: request.image_purpose,
      aspect_ratio: request.aspect_ratio,
      status: "queued",
      created_at: createdAt,
      updated_at: createdAt,
    });

    try {
      const brandContext = await this.resolveContext(request);
      const prompt = compileImagePrompt(request, { brandContext });
      this.repository.update(request.generation_id, {
        status: "processing",
        updated_at: this.timestamp(),
      });

      const referenceAssets = (request.reference_assets || []).map((asset) => ({
        asset_id: asset.asset_id,
        ...(job ? { tenant_id: job.tenant_id } : {}),
        project_id: request.project_id,
        requested_by_user_id: request.user_id,
        required_right: IMAGE_REFERENCE_RIGHT,
        generation_id: request.generation_id,
        execution_id: request.execution_id,
      }));
      const result = await this.callProvider({
        prompt,
        aspect_ratio: request.aspect_ratio,
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
        },
      });
      const completedAt = this.timestamp();

      return this.repository.update(request.generation_id, {
        status: "completed",
        approval_status: "pending",
        provider: result.provider,
        provider_job_id: result.provider_job_id,
        asset: result.asset,
        updated_at: completedAt,
        completed_at: completedAt,
      });
    } catch (error) {
      const safeError =
        error instanceof ImageGenerationError
          ? error
          : new ImageGenerationInternalError();
      this.markFailed(request.generation_id, safeError.code);
      throw safeError;
    }
  }
}

module.exports = { ImageGenerationService };
