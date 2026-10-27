const {it}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const http=require('supertest');
const {createStrategyRouter}=require('../src/strategy-workflows/router');
const {AuthenticationRequiredError}=require('../src/authorization');
it('strategy routes remain authenticated, private and unavailable without explicit service composition',async()=>{
 const app=express();app.use(express.json());app.use('/customer/strategy-workflows',createStrategyRouter({tokenVerifier:{verifyAccessToken:async token=>{if(!token)throw new AuthenticationRequiredError();return {kind:'customer',auth_user_id:'00000000-0000-4000-8000-000000000001'};}}}));
 for(const [method,path] of [['post','/'],['get','/00000000-0000-4000-8000-000000000002'],['post','/00000000-0000-4000-8000-000000000002/quote'],['post','/00000000-0000-4000-8000-000000000002/stop']]){
  const unauth=await http(app)[method]('/customer/strategy-workflows'+path);assert.equal(unauth.status,401);
  const unavailable=await http(app)[method]('/customer/strategy-workflows'+path).set('Authorization','Bearer synthetic');assert.equal(unavailable.status,503);assert.equal(unavailable.body.error.code,'STRATEGY_WORKFLOW_UNAVAILABLE');assert.match(unavailable.headers['cache-control'],/private.*no-store/);assert.match(unavailable.headers.vary,/Authorization/i);
 }
});
