const express = require("express");
const { z } = require("zod");
const {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} = require("../authorization");
const {
  CampaignError,
  CampaignPersistenceError,
  CampaignResourceError,
  CampaignValidationError,
  CampaignVersionError,
} = require("./errors");
const { identifier, uuid } = require("./schema");
const { createDefaultGoalRecommendationRegistry } = require("./goalRecommendation");
const { CampaignStrategyValidationError, CampaignVariantGenerationService } = require("./generation");
const { safeMeasurement } = require("./measurementRegistry");
const { GenerationIncompleteError } = require("../generation");

const AUTHENTICATION_ERROR = Object.freeze({
  code: "AUTHENTICATION_REQUIRED",
  message: "Customer authentication is required",
});
const AUTHORIZATION_ERROR = Object.freeze({
  code: "RESOURCE_NOT_AVAILABLE",
  message: "The requested resource is not available",
});
const AUTHORIZATION_UNAVAILABLE_ERROR = Object.freeze({
  code: "AUTHORIZATION_UNAVAILABLE",
  message: "Customer authorization is temporarily unavailable",
});
const STRATEGY_VALIDATION_ERROR = Object.freeze({
  code: "CAMPAIGN_STRATEGY_REJECTED",
  message: "Generated campaign strategy did not pass quality validation",
});
const GENERATION_INCOMPLETE_ERROR = Object.freeze({
  code: "GENERATION_INCOMPLETE",
  message: "Generated campaign content was incomplete and was not saved",
});

const idempotencyKey = identifier;
const expectedVersion = z.number().int().min(0).max(2147483647);
const queryScope = z.object({ tenant_id: identifier, project_id: identifier }).strict();
const bodyScope = queryScope.extend({ idempotency_key: idempotencyKey }).strict();
const recommendationBody = bodyScope.extend({
  brand_id: identifier,
  goal: z.string(),
  display_timezone: z.string().optional(),
}).strict();

const createCampaignBody = bodyScope.extend({
  brand_id: identifier,
  name: z.string(),
  goal: z.string(),
  display_timezone: z.string(),
}).strict();
const updateCampaignBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  name: z.string(),
  display_timezone: z.string(),
}).strict();
const itemBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  name: z.string(),
  format: z.enum(["text", "image", "video"]),
  platform: z.enum(["linkedin", "instagram", "facebook", "tiktok", "youtube", "email", "other"]),
  placement: identifier,
  destination_label: z.string(),
  destination_key: uuid.optional(),
  initial_content: z.unknown().optional(),
}).strict();
const archiveBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  reason: z.string(),
}).strict();
const reviewBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  revision_id: uuid,
}).strict();
const previewRenderBody = bodyScope.extend({
  revision_id: uuid,
}).strict();
const acknowledgePreviewBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  revision_id: uuid,
  render_receipt_id: uuid,
  acknowledged: z.literal(true),
}).strict();
const approveBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  revision_id: uuid,
  preview_id: uuid,
  approved: z.literal(true),
}).strict();
const suppliedAsset = z.object({
  asset_id: uuid,
  role: z.enum(["primary", "supporting"]),
}).strict();
const generationBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  execution_mode: z.enum(["ai", "human", "hybrid"]).optional().default("ai"),
  execution_brief: z.string().trim().min(1).max(4000).optional(),
  supplied_assets: z.array(suppliedAsset).max(10).superRefine((assets, ctx) => {
    const seen = new Set();
    assets.forEach((asset, index) => {
      if (seen.has(asset.asset_id)) ctx.addIssue({ code: "custom", path: [index, "asset_id"], message: "Duplicate supplied asset" });
      seen.add(asset.asset_id);
    });
  }).optional().default([]),
}).strict().superRefine((body, ctx) => {
  if (body.execution_mode === "hybrid" && body.supplied_assets.length === 0) {
    ctx.addIssue({ code: "custom", path: ["supplied_assets"], message: "Hybrid execution requires supplied assets" });
  }
});
const scheduleBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  revision_id: uuid,
  scheduled_for: z.string().datetime({ offset: true }),
  timezone: z.string(),
  local_datetime: z.string(),
  utc_offset_minutes: z.number().int().min(-840).max(840),
}).strict();
const manualStartBody = bodyScope.extend({ expected_campaign_version: expectedVersion, revision_id: uuid }).strict();
const manualResolutionBody = bodyScope.extend({
  expected_campaign_version: expectedVersion,
  attempt_id: uuid,
  published_at: z.string().datetime({ offset: true }).optional(),
  publication_url: z.string().url().nullable().optional(),
  external_reference: identifier.nullable().optional(),
  note: z.string().nullable().optional(),
  reason: z.string().optional(),
}).strict();
const calendarQuery = queryScope.extend({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
}).strict();
const measurementBody = bodyScope.extend({
  idempotency_key: identifier,
  metric: z.enum(["reach","views","impressions","clicks","enquiries","leads","conversions","sales","revenue","value"]),
  value: z.number().finite().min(0).max(1e15),
  unit: z.enum(["count","gbp","usd","eur","percent","other"]).optional(),
  observed_at: z.string().datetime({ offset: true }),
  note: z.string().trim().min(1).max(1000).nullable().optional(),
}).strict();

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") throw new AuthenticationRequiredError();
  const match = authorizationHeader.match(/^Bearer ([^\s,]+)$/i);
  if (!match) throw new AuthenticationRequiredError();
  return match[1];
}

function parse(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CampaignValidationError();
  return parsed.data;
}

function contextFromAuthorization(authorization) {
  return {
    actor: authorization.actor,
    tenant_id: authorization.tenant_id,
    project_id: authorization.project_id,
    membership_role: authorization.membership_role,
    policy_version: "campaign-owner.v1",
  };
}

async function authorize({ req, tokenVerifier, authorizationService, tenantId, projectId, brandId, action }) {
  const actor = await tokenVerifier.verifyAccessToken(extractBearerToken(req.header("authorization")));
  const authorization = brandId
    ? await authorizationService.authorizeProjectBrand({
        actor,
        tenantId,
        projectId,
        brandId,
        action,
        requireApprovedBrand: true,
      })
    : await authorizationService.authorizeProject({ actor, tenantId, projectId, action });
  return contextFromAuthorization(authorization);
}

function command({ body, campaignId, commandType, expectedVersion, payload }) {
  return {
    contract_version: "campaign-spine.v1",
    idempotency_key: body.idempotency_key,
    expected_campaign_version: expectedVersion,
    command_type: commandType,
    tenant_id: body.tenant_id,
    project_id: body.project_id,
    ...(campaignId ? { campaign_id: campaignId } : {}),
    payload,
  };
}

function stageAction(campaign) {
  for (const item of campaign.items.values()) {
    if (item.archived_at) continue;
    for (const variant of item.variants.values()) {
      if (variant.pending_attempt_id) return { code: "resolve_publication_attempt", label: "Resolve publication attempt" };
      if (variant.workflow === "draft") return { code: "finish_draft", label: "Finish draft" };
      if (variant.workflow === "review") return { code: "review_preview", label: "Review preview" };
      if (variant.workflow === "approved") return { code: "schedule_or_publish", label: "Schedule or publish manually" };
      if (variant.workflow === "scheduled") return { code: "manual_action_required", label: "Manual action required" };
    }
  }
  return { code: "create_content_item", label: "Create content item" };
}

function safeVariant(variant, item) {
  const current = variant.revisions.get(variant.current_revision_id);
  return {
    variant_id: variant.variant_id,
    content_item_id: item.content_item_id,
    platform: variant.platform,
    placement: variant.placement,
    destination_label: variant.destination_label,
    workflow: variant.workflow,
    current_revision_id: variant.current_revision_id,
    current_content: current?.content || null,
    updated_at: variant.updated_at,
  };
}

function campaignVariant(campaign, variantId) {
  for (const item of campaign.items.values()) {
    const variant = item.variants.get(variantId);
    if (variant) return variant;
  }
  throw new CampaignResourceError();
}

function safeCampaign(campaign, { detail = false } = {}) {
  const base = {
    campaign_id: campaign.campaign_id,
    tenant_id: campaign.tenant_id,
    project_id: campaign.project_id,
    brand_id: campaign.brand_id,
    name: campaign.name,
    goal: campaign.goal,
    display_timezone: campaign.display_timezone,
    version: campaign.version,
    status: campaign.status,
    counts: campaign.counts,
    archived_at: campaign.archived_at,
    created_at: campaign.created_at,
    updated_at: campaign.updated_at,
    next_action: stageAction(campaign),
  };
  if (!detail) return base;
  return {
    ...base,
    items: [...campaign.items.values()].map((item) => ({
      content_item_id: item.content_item_id,
      name: item.name,
      format: item.format,
      status: item.status,
      counts: item.counts,
      archived_at: item.archived_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
      variants: [...item.variants.values()].map((variant) => safeVariant(variant, item)),
    })),
  };
}

function safeResult(result) {
  return {
    campaign_id: result.campaign_id,
    campaign_version: result.campaign_version,
    created_ids: result.created_ids,
  };
}

function sendCampaignError(error, res, logger) {
  if (error instanceof GenerationIncompleteError) {
    const details = error.details && typeof error.details === "object" ? error.details : {};
    logger.warn?.("campaign generation incomplete", {
      name: error.name,
      code: error.code,
      finish_reason: typeof details.finish_reason === "string" ? details.finish_reason : null,
      missing_sections: Array.isArray(details.missing_sections) ? details.missing_sections : [],
      retryable: typeof details.retryable === "boolean" ? details.retryable : null,
      incomplete_reason: typeof error.metadata?.incomplete_reason === "string" ? error.metadata.incomplete_reason : null,
      prompt_token_count: Number.isFinite(error.metadata?.prompt_token_count) ? error.metadata.prompt_token_count : null,
      output_token_count: Number.isFinite(error.metadata?.output_token_count) ? error.metadata.output_token_count : null,
      total_token_count: Number.isFinite(error.metadata?.total_token_count) ? error.metadata.total_token_count : null,
    });
    return res.status(422).json({ error: GENERATION_INCOMPLETE_ERROR });
  }
  if (error instanceof CampaignStrategyValidationError) {
    logger.warn?.(JSON.stringify({
      event: "campaign_strategy_validation_rejected",
      code: STRATEGY_VALIDATION_ERROR.code,
      name: error.name,
      generation_job_id: typeof error.generationJobId === "string" ? error.generationJobId : null,
      rejection_stage: typeof error.stage === "string" ? error.stage : null,
      reasons: Array.isArray(error.reasons) ? error.reasons : [],
    }));
    return res.status(422).json({ error: STRATEGY_VALIDATION_ERROR });
  }
  if (error instanceof AuthenticationRequiredError) {
    return res.status(401).json({ error: AUTHENTICATION_ERROR });
  }
  if (error instanceof AuthorizationDeniedError || error instanceof CampaignResourceError) {
    return res.status(404).json({ error: AUTHORIZATION_ERROR });
  }
  if (error instanceof CampaignValidationError) {
    return res.status(400).json({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof CampaignVersionError) {
    return res.status(409).json({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof CampaignPersistenceError) {
    return res.status(503).json({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof CampaignError) {
    return res.status(409).json({ error: { code: error.code, message: error.message } });
  }
  logger.error?.("customer campaign route failed", { name: error?.name || "Error", code: error?.code || null });
  return res.status(503).json({ error: AUTHORIZATION_UNAVAILABLE_ERROR });
}

function createCustomerCampaignRouter({
  repository,
  previewRegistry,
  campaignGenerationService,
  measurementRegistry,
  tokenVerifier,
  authorizationService,
  logger = console,
}) {
  if (!repository || !tokenVerifier || !authorizationService || !campaignGenerationService || !measurementRegistry) {
    throw new TypeError("Customer campaigns require repository, token verifier and authorization service");
  }
  const router = express.Router();

  router.post("/:campaignId/variants/:variantId/generate", async (req, res) => {
    try {
      const body = parse(generationBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const variantId = parse(uuid, req.params.variantId);
      const actor = await tokenVerifier.verifyAccessToken(extractBearerToken(req.header("authorization")));
      const projectAuthorization = await authorizationService.authorizeProject({ actor, tenantId: body.tenant_id, projectId: body.project_id, action: "project:read" });
      const campaign = await repository.getCampaign(contextFromAuthorization(projectAuthorization), campaignId);
      const generationAuthorization = await authorizationService.authorizeProjectBrand({
        actor,
        tenantId: body.tenant_id,
        projectId: body.project_id,
        brandId: campaign.brand_id,
        action: "generation:create",
        requireApprovedBrand: true,
      });
      const result = await campaignGenerationService.generate({
        authorization: generationAuthorization,
        campaignId,
        variantId,
        expectedCampaignVersion: body.expected_campaign_version,
        idempotencyKey: body.idempotency_key,
        executionMode: body.execution_mode,
        executionBrief: body.execution_brief,
        suppliedAssets: body.supplied_assets,
      });
      return res.status(201).json({ generation_id: result.generation_id, campaign: safeCampaign(result.campaign, { detail: true }) });
    } catch (error) { return sendCampaignError(error, res, logger); }
  });

  router.get("/", async (req, res) => {
    try {
      const scope = parse(queryScope, req.query);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: scope.tenant_id, projectId: scope.project_id, action: "project:read" });
      const campaigns = await repository.listCampaigns(context);
      return res.json({ campaigns: campaigns.map((campaign) => safeCampaign(campaign)) });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  router.post("/", async (req, res) => {
    try {
      const body = parse(createCampaignBody, req.body);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, brandId: body.brand_id, action: "project:write" });
      const result = await repository.executeCommand(context, command({
        body,
        commandType: "create_campaign",
        expectedVersion: 0,
        payload: {
          brand_id: body.brand_id,
          name: body.name,
          goal: body.goal,
          display_timezone: body.display_timezone,
        },
      }));
      return res.status(201).json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, result.campaign_id), { detail: true }) });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  router.get("/:campaignId", async (req, res) => {
    try {
      const scope = parse(queryScope, req.query);
      const campaignId = parse(uuid, req.params.campaignId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: scope.tenant_id, projectId: scope.project_id, action: "project:read" });
      return res.json({ campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  router.patch("/:campaignId", async (req, res) => {
    try {
      const body = parse(updateCampaignBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
      const result = await repository.executeCommand(context, command({
        body,
        campaignId,
        commandType: "update_campaign_details",
        expectedVersion: body.expected_campaign_version,
        payload: { name: body.name, display_timezone: body.display_timezone },
      }));
      return res.json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  router.post("/:campaignId/content-items", async (req, res) => {
    try {
      const body = parse(itemBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
      const result = await repository.executeCommand(context, command({
        body,
        campaignId,
        commandType: "create_content_item",
        expectedVersion: body.expected_campaign_version,
        payload: {
          name: body.name,
          format: body.format,
          platform: body.platform,
          placement: body.placement,
          destination_label: body.destination_label,
          ...(body.destination_key ? { destination_key: body.destination_key } : {}),
          ...(body.initial_content ? { initial_content: body.initial_content } : {}),
        },
      }));
      return res.status(201).json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  router.post("/:campaignId/variants/:variantId/review", async (req, res) => {
    try {
      const body = parse(reviewBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const variantId = parse(uuid, req.params.variantId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
      const result = await repository.executeCommand(context, command({
        body,
        campaignId,
        commandType: "submit_review",
        expectedVersion: body.expected_campaign_version,
        payload: { variant_id: variantId, revision_id: body.revision_id },
      }));
      return res.json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  router.post("/:campaignId/variants/:variantId/preview-renders", async (req, res) => {
    try {
      if (!previewRegistry) throw new CampaignPersistenceError();
      const body = parse(previewRenderBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const variantId = parse(uuid, req.params.variantId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
      const receipt = await previewRegistry.renderPreview(context, await repository.getCampaign(context, campaignId), {
        variant_id: variantId,
        revision_id: body.revision_id,
        idempotency_key: body.idempotency_key,
      });
      return res.status(201).json({ preview: receipt });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  router.post("/:campaignId/variants/:variantId/preview-acknowledgements", async (req, res) => {
    try {
      const body = parse(acknowledgePreviewBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const variantId = parse(uuid, req.params.variantId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
      const result = await repository.executeCommand(context, command({
        body,
        campaignId,
        commandType: "acknowledge_preview",
        expectedVersion: body.expected_campaign_version,
        payload: {
          variant_id: variantId,
          revision_id: body.revision_id,
          render_receipt_id: body.render_receipt_id,
          acknowledged: true,
        },
      }));
      return res.json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  router.post("/:campaignId/variants/:variantId/approval", async (req, res) => {
    try {
      const body = parse(approveBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const variantId = parse(uuid, req.params.variantId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
      const result = await repository.executeCommand(context, command({
        body,
        campaignId,
        commandType: "approve",
        expectedVersion: body.expected_campaign_version,
        payload: {
          variant_id: variantId,
          revision_id: body.revision_id,
          preview_id: body.preview_id,
          approved: true,
        },
      }));
      return res.json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  for (const [path, commandType] of [["schedule", "schedule"], ["reschedule", "reschedule"]]) {
    router.post(`/:campaignId/variants/:variantId/${path}`, async (req, res) => {
      try {
        const body = parse(scheduleBody, req.body);
        const campaignId = parse(uuid, req.params.campaignId);
        const variantId = parse(uuid, req.params.variantId);
        const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
        const currentCampaign = await repository.getCampaign(context, campaignId);
        const variant = campaignVariant(currentCampaign, variantId);
        const result = await repository.executeCommand(context, command({ body, campaignId, commandType, expectedVersion: body.expected_campaign_version, payload: {
          variant_id: variantId, revision_id: body.revision_id, approval_id: variant.active_approval_id,
          scheduled_for: body.scheduled_for, timezone: body.timezone, local_datetime: body.local_datetime, utc_offset_minutes: body.utc_offset_minutes,
        }}));
        return res.json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
      } catch (error) { return sendCampaignError(error, res, logger); }
    });
  }

  router.get("/:campaignId/calendar", async (req, res) => {
    try {
      const query = parse(calendarQuery, req.query);
      const campaignId = parse(uuid, req.params.campaignId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: query.tenant_id, projectId: query.project_id, action: "project:read" });
      const campaign = await repository.getCampaign(context, campaignId);
      const entries = await repository.listCalendarEntries(context, { from: query.from, to: query.to });
      return res.json({ entries: entries.filter((entry) => entry.campaign_id === campaign.campaign_id) });
    } catch (error) { return sendCampaignError(error, res, logger); }
  });

  router.get("/:campaignId/measurements", async (req, res) => {
    try {
      const query = parse(queryScope.extend({ variant_id: uuid.optional() }).strict(), req.query);
      const campaignId = parse(uuid, req.params.campaignId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: query.tenant_id, projectId: query.project_id, action: "project:read" });
      await repository.getCampaign(context, campaignId);
      const rows = await measurementRegistry.list(context, campaignId, query.variant_id);
      return res.json({ measurements: rows.map(safeMeasurement) });
    } catch (error) { return sendCampaignError(error, res, logger); }
  });

  router.post("/:campaignId/variants/:variantId/measurements", async (req, res) => {
    try {
      const body = parse(measurementBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const variantId = parse(uuid, req.params.variantId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
      const campaign = await repository.getCampaign(context, campaignId);
      const variant = campaignVariant(campaign, variantId);
      if (variant.workflow !== "published" || !variant.publication_id) throw new CampaignValidationError();
      let contentItemId = null;
      for (const item of campaign.items.values()) if (item.variants.has(variantId)) contentItemId = item.content_item_id;
      const publication = campaign.publications.get(variant.publication_id);
      const effective = publication ? (require("./projection").latestCorrection(campaign, publication.publication_id) || publication) : null;
      if (!publication || !effective) throw new CampaignValidationError();
      const row = await measurementRegistry.record(context, {
        tenant_id: campaign.tenant_id, project_id: campaign.project_id, brand_id: campaign.brand_id,
        campaign_id: campaign.campaign_id, content_item_id: contentItemId, variant_id: variantId,
        publication_id: publication.publication_id, workflow: variant.workflow, published_at: effective.published_at,
      }, body);
      return res.status(201).json({ measurement: safeMeasurement(row) });
    } catch (error) { return sendCampaignError(error, res, logger); }
  });

  router.post("/:campaignId/variants/:variantId/manual-publication", async (req, res) => {
    try {
      const body = parse(manualStartBody, req.body);
      const campaignId = parse(uuid, req.params.campaignId);
      const variantId = parse(uuid, req.params.variantId);
      const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
      const currentCampaign = await repository.getCampaign(context, campaignId);
      const variant = campaignVariant(currentCampaign, variantId);
      const result = await repository.executeCommand(context, command({ body, campaignId, commandType: "begin_manual_publication", expectedVersion: body.expected_campaign_version, payload: { variant_id: variantId, revision_id: body.revision_id, approval_id: variant.active_approval_id } }));
      return res.json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
    } catch (error) { return sendCampaignError(error, res, logger); }
  });

  for (const [path, commandType] of [["confirm", "confirm_manual_publication"], ["fail", "fail_manual_publication"], ["cancel", "cancel_manual_publication"]]) {
    router.post(`/:campaignId/variants/:variantId/manual-publication/${path}`, async (req, res) => {
      try {
        const body = parse(manualResolutionBody, req.body);
        const campaignId = parse(uuid, req.params.campaignId);
        const variantId = parse(uuid, req.params.variantId);
        const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
        const payload = commandType === "confirm_manual_publication"
          ? { variant_id: variantId, attempt_id: body.attempt_id, published_at: body.published_at, publication_url: body.publication_url ?? null, external_reference: body.external_reference ?? null, note: body.note ?? null, attested_published: true }
          : { variant_id: variantId, attempt_id: body.attempt_id, reason: body.reason, not_published_attestation: true };
        const result = await repository.executeCommand(context, command({ body, campaignId, commandType, expectedVersion: body.expected_campaign_version, payload }));
        return res.json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
      } catch (error) { return sendCampaignError(error, res, logger); }
    });
  }

  for (const [path, commandType] of [["archive", "archive_campaign"], ["restore", "restore_campaign"]]) {
    router.post(`/:campaignId/${path}`, async (req, res) => {
      try {
        const body = parse(archiveBody, req.body);
        const campaignId = parse(uuid, req.params.campaignId);
        const context = await authorize({ req, tokenVerifier, authorizationService, tenantId: body.tenant_id, projectId: body.project_id, action: "project:write" });
        const result = await repository.executeCommand(context, command({
          body,
          campaignId,
          commandType,
          expectedVersion: body.expected_campaign_version,
          payload: { reason: body.reason },
        }));
        return res.json({ result: safeResult(result), campaign: safeCampaign(await repository.getCampaign(context, campaignId), { detail: true }) });
      } catch (error) {
        return sendCampaignError(error, res, logger);
      }
    });
  }

  return router;
}

function createCustomerCampaignRecommendationRouter({
  recommendationRegistry = createDefaultGoalRecommendationRegistry(),
  measurementRegistry,
  tokenVerifier,
  authorizationService,
  logger = console,
}) {
  if (!recommendationRegistry || !measurementRegistry || !tokenVerifier || !authorizationService) {
    throw new TypeError("Customer campaign recommendations require registry, token verifier and authorization service");
  }
  const router = express.Router();

  router.post("/", async (req, res) => {
    try {
      const body = parse(recommendationBody, req.body);
      const context = await authorize({
        req,
        tokenVerifier,
        authorizationService,
        tenantId: body.tenant_id,
        projectId: body.project_id,
        brandId: body.brand_id,
        action: "project:read",
      });
      const evidence = await measurementRegistry.listBrand(context, body.brand_id);
      const recommendation = await recommendationRegistry.recommend(context, body, { evidence });
      return res.status(201).json({ recommendation });
    } catch (error) {
      return sendCampaignError(error, res, logger);
    }
  });

  return router;
}

module.exports = {
  createCustomerCampaignRecommendationRouter,
  createCustomerCampaignRouter,
  safeCampaign,
};
