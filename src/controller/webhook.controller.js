const crypto = require("crypto");
const UserSubscription = require("../module/userSubscription.model");
const { finalizePaidSubscription } = require("../services/subscriptionPayment.service");
const { logAudit } = require("../services/subscriptionAudit.service");

exports.razorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers["x-razorpay-signature"];
      const body = JSON.stringify(req.body);
      const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
      if (signature !== expected) {
        return res.status(400).json({ message: "Invalid webhook signature" });
      }
    }

    const event = req.body?.event;
    const payment = req.body?.payload?.payment?.entity;

    if (event === "payment.captured" && payment?.order_id) {
      const sub = await UserSubscription.findOne({
        "payment.gatewayOrderId": payment.order_id,
        "payment.paymentStatus": "PENDING"
      });
      if (sub) {
        sub.payment.paymentStatus = "PAID";
        sub.payment.gatewayPaymentId = payment.id;
        sub.status = "ACTIVE";
        await sub.save();
        await finalizePaidSubscription(sub);
        await logAudit({
          entityType: "UserSubscription",
          entityId: sub._id,
          action: "WEBHOOK_PAID",
          actorType: "SYSTEM",
          metadata: { paymentId: payment.id }
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
