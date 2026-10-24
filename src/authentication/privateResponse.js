// Customer identity and workspace data must never enter a shared/browser cache.
// Mount before CORS and parsing so denied and malformed requests are covered too.
function privateResponse(_req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  next();
}
module.exports = { privateResponse };
