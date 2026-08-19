const AUTHORIZATION_ACTIONS = Object.freeze([
  "tenant:read",
  "tenant:manage",
  "project:read",
  "project:write",
  "brand:read",
  "brand:write",
  "generation:create",
]);

const ROLE_ACTIONS = Object.freeze({
  owner: new Set(AUTHORIZATION_ACTIONS),
  member: new Set([
    "tenant:read",
    "project:read",
    "brand:read",
    "generation:create",
  ]),
});

function roleAllows(role, action) {
  return ROLE_ACTIONS[role]?.has(action) === true;
}

module.exports = {
  AUTHORIZATION_ACTIONS,
  ROLE_ACTIONS,
  roleAllows,
};
