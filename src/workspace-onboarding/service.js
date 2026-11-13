const { createHash } = require("node:crypto");
const { parseCustomerActor } = require("../customer-workspace/schema");
const { CustomerWorkspaceValidationError } = require("../customer-workspace/errors");
const {
  OnboardingIdempotencyError,
  OnboardingIncompleteError,
  OnboardingNotAuthorizedError,
  OnboardingPersistenceError,
  OnboardingValidationError,
  OnboardingVersionConflictError,
} = require("./errors");
const { parseSaveOnboardingRequest } = require("./schema");
const { businessMissing, isPlaceholderName, assertBusinessCompletion } = require("./completion");

const CONTRACT_VERSION = "workspace-onboarding.v1";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function requestHash(request) {
  const { idempotency_key: _key, ...rest } = request;
  return createHash("sha256").update(canonical(rest)).digest("hex");
}

function emptyRecord(scope) {
  return {
    ...scope,
    profile_version: 0,
    status: "not_started",
    sector_key: null,
    sector_source: null,
    industry_text: null,
    channels: [],
    channels_source: null,
    current_step: null,
    draft: {},
    completed_at: null,
    updated_at: null,
    last_idempotency_key: null,
    last_request_hash: null,
  };
}

function completeness(record, brain) {
  const missing = [];
  if (!record.sector_key) missing.push("sector_key");
  if (!record.channels.length) missing.push("channels");
  if (brain !== undefined) missing.push(...businessMissing(brain));
  return { sector: Boolean(record.sector_key), channels: record.channels.length > 0, ready_to_complete: missing.length === 0, missing };
}

// The public shape. Never exposes actor ids, idempotency keys or request hashes.
function toDto(record, brain) {
  return {
    contract_version: CONTRACT_VERSION,
    tenant_id: record.tenant_id,
    project_id: record.project_id,
    brand_id: record.brand_id,
    version: record.profile_version,
    status: record.status,
    sector: { key: record.sector_key, source: record.sector_source },
    industry_text: record.industry_text,
    channels: { values: [...record.channels], source: record.channels_source },
    current_step: record.current_step,
    draft: { ...record.draft },
    completeness: completeness(record, brain),
    completed_at: record.completed_at,
    updated_at: record.updated_at,
  };
}

class WorkspaceOnboardingService {
  constructor({ repository, workspaceRepository, brandBrainRepository, now = () => new Date() } = {}) {
    if (!repository || !workspaceRepository) {
      throw new TypeError("Workspace onboarding requires onboarding and workspace repositories");
    }
    this.repository = repository;
    this.workspaceRepository = workspaceRepository;
    this.brandBrainRepository = brandBrainRepository || null;
    this.now = now;
  }

  async #authorizedScope(actor, write = false) {
    let customer;
    try {
      customer = parseCustomerActor(actor);
    } catch (error) {
      if (error instanceof CustomerWorkspaceValidationError) throw new OnboardingNotAuthorizedError();
      throw error;
    }
    const scope = customer.trusted_scope;
    if (!scope) throw new OnboardingNotAuthorizedError();
    // Membership is re-checked on every call so a revoked membership stops working before the token expires.
    const selected = await this.workspaceRepository.getAuthorizedWorkspaceSelection({
      auth_user_id: customer.auth_user_id,
      ...scope,
    });
    if (!selected || (write && selected.membership_role !== "owner")) throw new OnboardingNotAuthorizedError();
    return { customer, scope: { tenant_id: scope.tenant_id, project_id: scope.project_id, brand_id: scope.brand_id }, workspace: selected };
  }

  async #view(scope, workspace, record, knownBrain) {
    const brain = knownBrain !== undefined ? knownBrain : this.brandBrainRepository
      ? await this.brandBrainRepository.getByProjectAndBrand(scope.project_id, scope.brand_id) : null;
    return { onboarding: toDto(record, brain), brand_name_placeholder: isPlaceholderName(brain?.name ?? workspace?.brand_name) };
  }

  async get({ actor }) {
    const { scope, workspace } = await this.#authorizedScope(actor);
    const record = (await this.repository.get(scope)) || emptyRecord(scope);
    return { status: "ready", ...await this.#view(scope, workspace, record) };
  }

  async save({ actor, request }) {
    const { customer, scope, workspace } = await this.#authorizedScope(actor, true);
    const input = parseSaveOnboardingRequest(request);
    const hash = requestHash(input);

    let current = (await this.repository.get(scope)) || emptyRecord(scope);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (current.last_idempotency_key === input.idempotency_key) {
        if (current.last_request_hash !== hash) throw new OnboardingIdempotencyError();
        await this.#authorizedScope(actor, true);
        return this.#response(scope, workspace, current, true);
      }
      if (current.profile_version !== input.expected_version) {
        throw new OnboardingVersionConflictError(current.profile_version);
      }
      const next = this.#apply(current, input, customer.auth_user_id, hash);
      const result = await this.repository.commit({ scope, expected_version: input.expected_version, record: next,
        auth_user_id: customer.auth_user_id,
        // Memory adapter rechecks at its commit boundary. PostgreSQL independently locks the real authority rows.
        authorizeWrite: async () => {
          await this.#authorizedScope(actor, true);
          if (next.status === "completed" && !this.brandBrainRepository) throw new OnboardingPersistenceError();
          const brain = this.brandBrainRepository
            ? await this.brandBrainRepository.getByProjectAndBrand(scope.project_id, scope.brand_id) : null;
          if (next.status === "completed") assertBusinessCompletion(brain);
          await this.#authorizedScope(actor, true);
          return brain;
        },
      });
      if (result.saved) return this.#response(scope, workspace, result.record, false, result.brain);
      // Lost a race: re-evaluate once so an identical concurrent retry is recognised as a replay.
      current = result.record || emptyRecord(scope);
    }
    throw new OnboardingVersionConflictError(current.profile_version);
  }

  async #response(scope, workspace, record, replayed, knownBrain) {
    return { status: "saved", replayed, ...await this.#view(scope, workspace, record, knownBrain) };
  }

  #apply(current, input, actorId, hash) {
    const next = { ...current, channels: [...current.channels], draft: { ...current.draft } };

    if (input.sector_key !== undefined) {
      if (input.sector_key === null) {
        next.sector_key = null;
        next.sector_source = null;
      } else {
        const source = input.sector_source || "customer";
        this.#guardInferred(current.sector_key && current.sector_source, source, "sector_source");
        next.sector_key = input.sector_key;
        next.sector_source = source;
      }
    } else if (input.sector_source !== undefined) {
      if (!current.sector_key) throw new OnboardingValidationError([{ path: "sector_source", code: "custom", message: "sector_source requires a sector_key" }]);
      this.#guardInferred(current.sector_source, input.sector_source, "sector_source");
      next.sector_source = input.sector_source;
    }

    if (input.industry_text !== undefined) next.industry_text = input.industry_text;

    if (input.channels !== undefined) {
      if (input.channels.length === 0) {
        next.channels = [];
        next.channels_source = null;
      } else {
        const source = input.channels_source || "customer";
        this.#guardInferred(current.channels.length ? current.channels_source : null, source, "channels_source");
        next.channels = [...input.channels];
        next.channels_source = source;
      }
    } else if (input.channels_source !== undefined) {
      if (!current.channels.length) throw new OnboardingValidationError([{ path: "channels_source", code: "custom", message: "channels_source requires channels" }]);
      this.#guardInferred(current.channels_source, input.channels_source, "channels_source");
      next.channels_source = input.channels_source;
    }

    if (input.current_step !== undefined) next.current_step = input.current_step;

    if (input.draft) {
      for (const [key, value] of Object.entries(input.draft)) {
        if (value === null) delete next.draft[key];
        else if (value !== undefined) next.draft[key] = value;
      }
    }

    const timestamp = this.now().toISOString();
    const check = completeness(next);
    if (input.complete === true) {
      if (!check.ready_to_complete) throw new OnboardingIncompleteError(check.missing);
      next.status = "completed";
      next.completed_at = current.status === "completed" ? current.completed_at : timestamp;
    } else if (input.complete === false) {
      next.status = "in_progress";
      next.completed_at = null;
    } else if (current.status === "completed") {
      // Editing a completed profile must not leave it completed but incomplete.
      if (!check.ready_to_complete) throw new OnboardingIncompleteError(check.missing);
    } else {
      next.status = "in_progress";
    }

    return {
      ...next,
      profile_version: current.profile_version + 1,
      updated_at: timestamp,
      updated_by: actorId,
      last_idempotency_key: input.idempotency_key,
      last_request_hash: hash,
    };
  }

  // A value the customer chose is never silently replaced by an inferred one.
  #guardInferred(existingSource, incomingSource, path) {
    if (existingSource === "customer" && incomingSource === "inferred") {
      throw new OnboardingValidationError([{ path, code: "custom", message: "An inferred value cannot replace a value the customer chose" }]);
    }
  }
}

module.exports = { CONTRACT_VERSION, WorkspaceOnboardingService, emptyRecord, toDto };
