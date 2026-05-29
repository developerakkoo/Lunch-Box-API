const SubscriptionAuditLog = require("../module/subscriptionAuditLog.model");

async function logAudit({
  entityType,
  entityId,
  action,
  actorType = "SYSTEM",
  actorId,
  before,
  after,
  metadata
}) {
  return SubscriptionAuditLog.create({
    entityType,
    entityId,
    action,
    actorType,
    actorId,
    before,
    after,
    metadata
  });
}

module.exports = { logAudit };
