/** Fire-and-forget deposit notification to the company webhook (if configured). */
function sendDepositWebhook(payload) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => console.error('Webhook delivery failed:', err.message));
}

module.exports = { sendDepositWebhook };
