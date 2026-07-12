/** Fire-and-forget deposit notification to the company webhook (if configured). */
function sendDepositWebhook(payload) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.WEBHOOK_SECRET) headers['x-webhook-secret'] = process.env.WEBHOOK_SECRET;
  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }).catch((err) => console.error('Webhook delivery failed:', err.message));
}

module.exports = { sendDepositWebhook };
