// Provider-neutral boundary. No driver, credentials, keys or live storage are configured here.
const {randomUUID}=require('node:crypto');
const {z}=require('zod');
const {identifier,uuid}=require('../campaigns/schema');
const {QuoteError,digest}=require('../generation-quotes/service');
const Binding=z.object({tenant_id:identifier,project_id:identifier,brand_id:identifier,platform:z.enum(['tiktok','linkedin','instagram','facebook','youtube']),account_id:identifier}).strict();
const Credentials=z.object({accessToken:z.string().min(1).max(16384),refreshToken:z.string().min(1).max(16384).optional(),expiresAt:z.string().datetime({offset:true})}).strict();
class SocialTokenVault{
 constructor({driver=null,now=()=>new Date()}={}){this.driver=driver;this.now=now;}
 ready(){if(!this.driver||!['create','read','revoke'].every(k=>typeof this.driver[k]==='function'))throw new QuoteError('SOCIAL_TOKEN_VAULT_UNAVAILABLE',503);}
 binding(value){const r=Binding.safeParse(value);if(!r.success)throw new QuoteError('SOCIAL_TOKEN_UNAVAILABLE',404);return r.data;}
 credentials(value){const r=Credentials.safeParse(value);if(!r.success||Date.parse(r.data.expiresAt)<=this.now().getTime())throw new QuoteError('SOCIAL_TOKEN_UNAVAILABLE',404);return r.data;}
 async store(binding,credentials){this.ready();const bound=this.binding(binding),secret=this.credentials(credentials),reference=randomUUID();try{const result=await this.driver.create({reference,binding:bound,credentials:secret});if(result!==reference)throw Error();return reference;}catch{throw new QuoteError('SOCIAL_TOKEN_VAULT_UNAVAILABLE',503);}}
 async use(reference,binding,operation){this.ready();const bound=this.binding(binding);if(!uuid.safeParse(reference).success||typeof operation!=='function')throw new QuoteError('SOCIAL_TOKEN_UNAVAILABLE',404);let row;try{row=await this.driver.read({reference,binding:bound});}catch{throw new QuoteError('SOCIAL_TOKEN_VAULT_UNAVAILABLE',503);}if(!row||row.revoked===true||digest(this.binding(row.binding))!==digest(bound))throw new QuoteError('SOCIAL_TOKEN_UNAVAILABLE',404);const secret=this.credentials(row.credentials);try{return await operation(Object.freeze({...secret}));}catch{throw new QuoteError('SOCIAL_PROVIDER_OPERATION_UNAVAILABLE',503);}}
 async revoke(reference,binding){this.ready();const bound=this.binding(binding);if(!uuid.safeParse(reference).success)throw new QuoteError('SOCIAL_TOKEN_UNAVAILABLE',404);try{await this.driver.revoke({reference,binding:bound});}catch{throw new QuoteError('SOCIAL_TOKEN_VAULT_UNAVAILABLE',503);}return {revoked:true};}
}
module.exports={SocialTokenVault};
