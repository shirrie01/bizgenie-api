// Provider-issued IDs are opaque data, not BizGenie scope identifiers or URLs.
const {z}=require('zod');
const ProviderId=z.string().min(1).max(2048).regex(/^[\x21-\x7e]+$/);
module.exports={ProviderId};
