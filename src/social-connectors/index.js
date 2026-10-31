// Registry of social platform connectors, keyed by platform name. A factory receives { env, pool, logger, now } and returns the platform entry DurableSocialPublishing
// expects ({ requiredScopes, publicOrigins, oauth, connector: { exchange, publish, reconcile }, analytics? }) or THROWS if its reviewed configuration or credentials are missing.
// A platform that is not registered here cannot be enabled (premiumComposition fails closed).
const registry = {};
module.exports = { registry };
