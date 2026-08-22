const errors = require("./errors");
const credential = require("./credential");
const middleware = require("./middleware");

module.exports = {
  ...errors,
  ...credential,
  ...middleware,
};
