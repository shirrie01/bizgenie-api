const {createStudioBridge}=require('../../src/studio-bridge/service');
const founder='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const target={environment:'staging',revision:'bizgenie-api-staging-00030-pob',sourceSha:'a'.repeat(40),reviewRef:'synthetic_review',upstream:'https://accept---bizgenie-api-staging-abc-ew.a.run.app',audience:'https://bizgenie-api-staging-abc-ew.a.run.app',origin:'https://bizgenie-studio-staging.pages.dev',allowFounderOnboarding:true,founderAuthUserId:founder,allowWrites:false,allowWorkspaceBootstrap:false,allowDraftWorkflow:false,allowGenerationConfirmation:false,allowSocialWrites:false,allowStripeCheckout:false};
const writes=[['POST','/customer/workspace/bootstrap'],['PUT','/customer/workspace/onboarding'],['PUT','/customer/workspace/brand-brain']];
module.exports={createStudioBridge,founder,other,target,writes};
