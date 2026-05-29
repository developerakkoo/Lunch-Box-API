const cron = require("node-cron");
const {
  activateDueDeliveries,
  getTomorrowDemandByPartner
} = require("../services/subscriptionSchedule.service");
const { runRenewalJob } = require("../services/subscriptionRenewal.service");
const { createWeeklySettlementBatches } = require("../services/settlement.service");
const { notifyPartnerSubscription } = require("../services/subscriptionNotification.service");
const logger = require("../utils/logger");

function initSubscriptionSchedulers() {
  if (process.env.SUBSCRIPTION_SCHEDULER_ENABLED === "false") {
    logger.warn("Subscription schedulers disabled");
    return;
  }

  cron.schedule("30 0 * * *", async () => {
    try {
      const { activated } = await activateDueDeliveries();
      logger.info("Subscription activation job", { activated });
    } catch (err) {
      logger.error("Subscription activation job failed", { message: err.message });
    }
  });

  cron.schedule("0 6 * * *", async () => {
    try {
      const result = await runRenewalJob();
      logger.info("Subscription renewal job", result);
    } catch (err) {
      logger.error("Subscription renewal job failed", { message: err.message });
    }
  });

  cron.schedule("0 18 * * *", async () => {
    try {
      const rows = await getTomorrowDemandByPartner();
      for (const row of rows) {
        await notifyPartnerSubscription(row._id, {
          title: "Tomorrow's subscription demand",
          message: `${row.count} meal(s) scheduled for tomorrow.`,
          type: "TOMORROW_DEMAND",
          data: { count: row.count }
        });
      }
    } catch (err) {
      logger.error("Tomorrow demand job failed", { message: err.message });
    }
  });

  cron.schedule("0 2 * * 1", async () => {
    try {
      const { created } = await createWeeklySettlementBatches();
      logger.info("Weekly settlement job", { created });
    } catch (err) {
      logger.error("Settlement job failed", { message: err.message });
    }
  });
}

module.exports = { initSubscriptionSchedulers };
