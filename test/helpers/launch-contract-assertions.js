const assert=require('node:assert/strict');
const {z}=require('zod');
const contract=require('../../docs/contracts/BG_LAUNCH_012_CUSTOMER_API.json');
module.exports=function verify(id,response){
 const route=contract.endpoints.find(x=>x.id===id);assert.ok(route,'Known versioned endpoint '+id);
 assert.equal(response.status,route.success_status||200,id+' response status');
 for(const field of route.response_fields||[])assert.ok(Object.hasOwn(response.body,field),id+' missing response field '+field);
 for(const field of route.conditional_response_fields?.[response.body.status]||[])assert.ok(Object.hasOwn(response.body,field),id+' missing conditional '+field);
 const validators={string:z.string(),integer:z.number().int(),boolean:z.boolean(),object:z.record(z.string(),z.unknown()),array:z.array(z.unknown())};
 for(const [field,type] of Object.entries(route.response_field_types||{})){if(!Object.hasOwn(response.body,field))continue;const alternatives=type.split('|').map(t=>t==='null'?z.null():validators[t]);const schema=alternatives.length===1?alternatives[0]:z.union(alternatives);assert.ok(schema.safeParse(response.body[field]).success,id+' invalid type for '+field);}
 if(route.response_contract)assert.equal(response.body.contract_version,route.response_contract,id+' envelope version');
 if(route.dto_contract)assert.equal(response.body.onboarding.contract_version,route.dto_contract);
 if(route.response_statuses)assert.ok(route.response_statuses.includes(response.body.status));
};
