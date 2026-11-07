const {
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  GRAPH_URL,
  GRAPH_TIMEOUT_MS,
  BOT_URL,
  BOT_TIMEOUT_MS,
  CONTEXT_SERVICE_API_KEY
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

  // The message already went out; a failure below is reported, not thrown.
  const [logged, paused] = await Promise.all([
    contextService.logReply(storeId, phone, text, messageId).then(
      () => true,
      (err) => {
        console.error(`[send] logging reply to ${phone} failed: ${err.message}`);
        return false;
      }
    ),
    pauseBot(phone)
  ]);

  return { messageId, logged, paused };
}

// Tells the bot an admin is handling this customer, so it stops replying to
// them for a while — as when the owner replies from the WhatsApp Business app.
async function pauseBot(phone) {
  if (!BOT_URL) {
    console.error("[takeover] BOT_URL is not set; the bot was not paused");
    return false;
  }
  try {
    const res = await fetch(`${BOT_URL}/api/takeover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CONTEXT_SERVICE_API_KEY ? { "x-api-key": CONTEXT_SERVICE_API_KEY } : {})
      },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(BOT_TIMEOUT_MS)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    console.log(`[takeover] bot paused for ${phone}`);
    return true;
  } catch (err) {
    console.error(`[takeover] pausing the bot for ${phone} failed: ${err.message}`);
    return false;
  }
}

module.exports = {
  SendError,
  sendText
};
