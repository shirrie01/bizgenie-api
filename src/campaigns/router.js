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

const idempotencyKey = identifier;
const expectedVersion = z.number().int().min(0).max(2147483647);
const queryScope = z.object({ tenant_id: identifier, project_id: identifier }).strict();
const bodyScope = queryScope.extend({ idempotency_key: idempotencyKey }).strict();

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
  tokenVerifier,
  authorizationService,
  logger = console,
}) {
  if (!repository || !tokenVerifier || !authorizationService) {
    throw new TypeError("Customer campaigns require repository, token verifier and authorization service");
  }
  const router = express.Router();

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

module.exports = {
  createCustomerCampaignRouter,
  safeCampaign,
};
