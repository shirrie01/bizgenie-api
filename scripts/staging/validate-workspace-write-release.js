// Offline spec validation; no cloud requests, database access or deployment.
'use strict';
const {validateRelease}=require('./validate-bridge-release');
function validateWorkspaceWriteRelease(r){
 if(r?.environment?.BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP!=='true')throw Error('WORKSPACE_WRITE_RELEASE_NOT_READY');
 for(const k of ['workspaceBootstrapApproval','upstreamDatabasePoolEvidence','upstreamAuthProvisionerEvidence'])if(typeof r[k]!=='string'||!r[k].trim()||r[k].includes('UNRESOLVED'))throw Error('WORKSPACE_WRITE_RELEASE_NOT_READY');
 const clone=structuredClone(r);clone.environment.BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP='false';
 const result=validateRelease(clone);
 return {...result,status:'OFFLINE_WORKSPACE_ONLY_VALIDATED_NOT_DEPLOYMENT_APPROVAL'};
}
if(require.main===module){try{console.log(JSON.stringify(validateWorkspaceWriteRelease(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('WORKSPACE_WRITE_RELEASE_NOT_READY');process.exitCode=1;}}
module.exports={validateWorkspaceWriteRelease};
