const {
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  GRAPH_URL,
  GRAPH_TIMEOUT_MS
} = require("./config");
const contextService = require("./context-client");

/*
 * Sends a reply typed in the panel to the customer on WhatsApp, then logs it
 * to the customer context service the way the bot logs its own sends
 * (logBotMessage in wa-faq-cloud's src/logging.js), so it shows in the chat.
 */
class SendError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Meta: free-form text only within 24h of the customer's last message.
const OUTSIDE_WINDOW = 131047;

async function sendText(storeId, phone, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    throw new SendError("WHATSAPP_TOKEN / PHONE_NUMBER_ID are not set", 503);
  }

  let res;
  try {
    res = await fetch(GRAPH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: text }
      }),
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS)
    });
  } catch (err) {
    throw new SendError(
      `WhatsApp unreachable (${err.name === "TimeoutError" ? "timed out" : err.message})`,
      502
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = data.error || {};
    console.error(`[send] Meta API error -> ${phone}:`, JSON.stringify(data));
    throw new SendError(
      error.code === OUTSIDE_WINDOW
        ? "Can't send: the customer hasn't messaged in the last 24 hours"
        : `WhatsApp rejected the message${error.message ? `: ${error.message}` : ""}`,
      502
    );
  }

  const messageId = data.messages?.[0]?.id || null;
  console.log(`[send] admin reply -> ${phone} (${messageId})`);

  // The message already went out; a failed log only means the panel won't show it.
  let logged = true;
  try {
    await contextService.logReply(storeId, phone, text, messageId);
  } catch (err) {
    logged = false;
    console.error(`[send] logging reply to ${phone} failed: ${err.message}`);
  }

  return { messageId, logged };
}

module.exports = {
  SendError,
  sendText
};
