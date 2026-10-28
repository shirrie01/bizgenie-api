const express = require("express");
const {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} = require("../authorization");
const { extractBearerToken } = require("../authentication");
const { CreditAccountUnavailableError } = require("./errors");

const AUTHENTICATION_ERROR = Object.freeze({
  code: "AUTHENTICATION_REQUIRED",
  message: "Customer authentication is required",
});

const RESOURCE_ERROR = Object.freeze({
  code: "RESOURCE_NOT_AVAILABLE",
  message: "The requested resource is not available",
});

function customerSubscription(entitlement) {
  if (!entitlement) return null;
  return Object.freeze({
    plan_code: entitlement.plan_code,
    entitlement_status: entitlement.status,
    included_monthly_credit_grant: entitlement.included_monthly_credit_grant,
    starts_at: entitlement.starts_at,
    ends_at: entitlement.ends_at,
    reference_period_start: entitlement.reference_period_start,
    reference_period_end: entitlement.reference_period_end,
    cancellation_effective_at: entitlement.cancellation_effective_at,
    grace_ends_at: entitlement.grace_ends_at,
  });
}

function createCustomerBillingRouter({
  repository,
  commercialCatalog = null,
  tokenVerifier,
  authorizationService,
  now = () => new Date(),
  logger = console,
}) {
  if (!repository || !tokenVerifier || !authorizationService) {
    throw new TypeError(
      "Customer billing routes require repository, token verification, and authorization dependencies"
    );
  }

  const router = express.Router();

  router.get('/credit-preview',async(req,res)=>{
    try {
      const {z}=require('zod');const {identifier,executionClass}=require('./schema');
      // Query strings are deliberately parsed below; no client price or balance is accepted.
      const schema=z.object({tenant_id:identifier,project_id:identifier,brand_id:identifier,execution_class:executionClass,spend_cap:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER)}).strict();
      const input=schema.safeParse(req.query);if(!input.success)return res.status(400).json({status:'failed',error:{code:'VALIDATION_ERROR',message:'Request validation failed'}});
      const token=extractBearerToken(req.header('authorization'));
      const actor=await tokenVerifier.verifyAccessToken(token);
      const auth=await authorizationService.authorizeProjectBrand({actor,tenantId:input.data.tenant_id,projectId:input.data.project_id,brandId:input.data.brand_id,action:'generation:create'});
      const {BillingService}=require('./service');const service=new BillingService({repository,now});
      const observed=now();
      const price=await service.resolveExecutionCreditCost({tenantId:auth.tenant_id,executionClass:input.data.execution_class,at:observed.toISOString()});
      const balance=await service.readBalance({tenantId:auth.tenant_id});
      return res.json({contract_version:'execution-cost-preview.v1',tenant_id:auth.tenant_id,project_id:auth.project_id,brand_id:auth.brand_id,
        execution_class:price.execution_class,credit_cost:price.credit_cost,policy_id:price.policy_id,entitlement_id:price.entitlement_id,
        available_credits:balance.available_balance,spend_cap:input.data.spend_cap,
        affordability:price.credit_cost>input.data.spend_cap?'spend_cap_exceeded':price.credit_cost>balance.available_balance?'insufficient_credits':'within_limit',
        observed_at:observed.toISOString(),expires_at:new Date(observed.getTime()+60000).toISOString(),reserved:false,execution_authorized:false,confirmation_supported:false});
    }catch(error){
      if(error instanceof AuthenticationRequiredError)return res.status(401).json({status:'failed',error:AUTHENTICATION_ERROR});
      if(error instanceof AuthorizationDeniedError)return res.status(404).json({status:'failed',error:RESOURCE_ERROR});
      return res.status(503).json({status:'unavailable',error:{code:'CREDIT_PREVIEW_UNAVAILABLE',message:'Credit cost is temporarily unavailable'}});
    }
  });

  router.get('/plans',async(req,res)=>{
    try {
      const token=extractBearerToken(req.header('authorization'));
      const actor=typeof tokenVerifier.verifyIdentityAccessToken==='function'?await tokenVerifier.verifyIdentityAccessToken(token):await tokenVerifier.verifyAccessToken(token);
      await authorizationService.authorizeTenant({actor,tenantId:req.query.tenant_id,action:'tenant:read'});
      if(!commercialCatalog)throw new Error('Unconfigured catalogue');
      return res.json(commercialCatalog.read());
    }catch(error){
      if(error instanceof AuthenticationRequiredError)return res.status(401).json({status:'failed',error:AUTHENTICATION_ERROR});
      if(error instanceof AuthorizationDeniedError)return res.status(404).json({status:'failed',error:RESOURCE_ERROR});
      return res.status(503).json({status:'unavailable',error:{code:'COMMERCIAL_CATALOG_UNAVAILABLE',message:'Approved plans and terms are unavailable'}});
    }
  });

  router.get("/subscription", async (req, res) => {
    try {
      const accessToken = extractBearerToken(req.header("authorization"));
      const actor =
        typeof tokenVerifier.verifyIdentityAccessToken === "function"
          ? await tokenVerifier.verifyIdentityAccessToken(accessToken)
          : await tokenVerifier.verifyAccessToken(accessToken);
      const tenantAuthorization = await authorizationService.authorizeTenant({
        actor,
        tenantId: req.query.tenant_id,
        action: "tenant:read",
      });
      const tenantId = tenantAuthorization.tenant_id;

      const entitlement = await repository.getActiveEntitlement(tenantId, now().toISOString());
      if (!entitlement) {
        return res.json({ status: "not_subscribed", subscription: null, available_credits: null });
      }

      let availableCredits = null;
      try {
        const balance = await repository.readBalance(tenantId);
        availableCredits = balance.available_balance;
      } catch (error) {
        if (!(error instanceof CreditAccountUnavailableError)) throw error;
      }

      return res.json({
        status: "ready",
        subscription: customerSubscription(entitlement),
        available_credits: availableCredits,
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        logger.warn?.("customer billing authentication rejected", {
          code: AUTHENTICATION_ERROR.code,
          path: req.path,
        });
        return res.status(401).json({ status: "failed", error: AUTHENTICATION_ERROR });
      }
      if (error instanceof AuthorizationDeniedError) {
        return res.status(404).json({ status: "failed", error: RESOURCE_ERROR });
      }

      logger.error?.("customer billing state unavailable", {
        code: "BILLING_STATE_UNAVAILABLE",
        path: req.path,
      });
      return res.status(503).json({
        status: "failed",
        error: {
          code: "BILLING_STATE_UNAVAILABLE",
          message: "Billing status is temporarily unavailable",
        },
      });
    }
  });

  return router;
}

module.exports = {
  AUTHENTICATION_ERROR,
  RESOURCE_ERROR,
  createCustomerBillingRouter,
  customerSubscription,
};
