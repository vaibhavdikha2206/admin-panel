const {
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  WHATSAPP_BUSINESS_ACCOUNT_ID,
  GRAPH_BASE,
  GRAPH_URL,
  GRAPH_TIMEOUT_MS,
  BOT_URL,
  BOT_TIMEOUT_MS,
  CONTEXT_SERVICE_API_KEY
} = require("./config");
const contextService = require("./context-client");

/*
 * Sends messages typed in the panel to customers on WhatsApp, then logs them
 * to the customer context service the way the bot logs its own sends
 * (logBotMessage in wa-faq-cloud's src/logging.js), so they show in the chat.
 */
class SendError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.status = status;
    this.code = code; // Meta's error code, when Meta answered
  }
}

// Meta: free-form text only within 24h of the customer's last message.
const OUTSIDE_WINDOW = 131047;
// Meta: the access token is invalid or expired.
const BAD_TOKEN = 190;

async function graph(url, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
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
    console.error(`[send] Meta API error (${method} ${url.split("?")[0]}):`, JSON.stringify(data));
    throw new SendError(
      error.code === OUTSIDE_WINDOW
        ? "Can't send: the customer hasn't messaged in the last 24 hours"
        : `WhatsApp rejected the request${error.message ? `: ${error.message}` : ""}`,
      502,
      error.code ?? null
    );
  }
  return data;
}

// Sends one Graph API message payload; resolves to its wamid.
async function postMessage(payload) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    throw new SendError("WHATSAPP_TOKEN / PHONE_NUMBER_ID are not set", 503);
  }
  const data = await graph(GRAPH_URL, {
    method: "POST",
    body: { messaging_product: "whatsapp", ...payload }
  });
  return data.messages?.[0]?.id || null;
}

// Onto the customer's chat history. Never throws: the message already went
// out, so a failure here only means the panel won't show it.
function logSent(storeId, phone, text, messageId) {
  return contextService.logReply(storeId, phone, text, messageId).then(
    () => true,
    (err) => {
      console.error(`[send] logging message to ${phone} failed: ${err.message}`);
      return false;
    }
  );
}

async function sendText(storeId, phone, text) {
  const messageId = await postMessage({ to: phone, type: "text", text: { body: text } });
  console.log(`[send] admin reply -> ${phone} (${messageId})`);

  const [logged, paused] = await Promise.all([
    logSent(storeId, phone, text, messageId),
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

/* ---------- Templates ---------- */

// {{1}}, {{2}} (positional) or {{first_name}} (named), in order, once each.
function variablesOf(text) {
  return [...new Set([...(text || "").matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]))];
}

// What the panel needs to show and send a template. Only templates whose
// variables are all in the body can be sent for now: a media header or a
// variable in the header or a button needs more than one text box per variable.
function toTemplate(t) {
  const part = (type) => (t.components || []).find((c) => c.type === type) || {};
  const header = part("HEADER");
  const body = part("BODY");
  const footer = part("FOOTER");
  const buttons = part("BUTTONS").buttons || [];

  const known = ["HEADER", "BODY", "FOOTER", "BUTTONS"];
  const other = (t.components || []).find((c) => !known.includes(c.type));

  let unsupported = null;
  if (other) {
    unsupported = other.type.toLowerCase().replace(/_/g, " ");
  } else if (header.format && header.format !== "TEXT") {
    unsupported = `${header.format.toLowerCase()} header`;
  } else if (variablesOf(header.text).length) {
    unsupported = "variable in the header";
  } else if (buttons.some((b) => variablesOf(b.url).length || b.type === "COPY_CODE" || b.type === "FLOW")) {
    unsupported = "button that needs a value";
  }

  return {
    name: t.name,
    language: t.language,
    category: t.category,
    named: t.parameter_format === "NAMED",
    header: header.format === "TEXT" ? header.text : null,
    body: body.text || "",
    footer: footer.text || null,
    buttons: buttons.map((b) => b.text),
    variables: variablesOf(body.text),
    unsupported
  };
}

// The business account's approved templates.
async function listTemplates() {
  if (!WHATSAPP_TOKEN || !WHATSAPP_BUSINESS_ACCOUNT_ID) {
    throw new SendError("WHATSAPP_TOKEN / WHATSAPP_BUSINESS_ACCOUNT_ID are not set", 503);
  }
  const fields = "name,language,category,status,parameter_format,components";
  let url = `${GRAPH_BASE}/${encodeURIComponent(WHATSAPP_BUSINESS_ACCOUNT_ID)}/message_templates?status=APPROVED&limit=100&fields=${fields}`;
  const templates = [];
  for (let page = 0; url && page < 10; page += 1) {
    const data = await graph(url);
    templates.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return templates
    .filter((t) => t.status === "APPROVED")
    .map(toTemplate)
    .sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
}

// The template as the customer reads it, for the chat history.
function renderTemplate(template, values) {
  const fill = (text) =>
    (text || "").replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (all, v) => values[v] ?? all);
  return [template.header ? `*${template.header}*` : null, fill(template.body), template.footer]
    .filter(Boolean)
    .join("\n\n");
}

async function sendTemplate(storeId, phone, template, values) {
  const parameters = template.variables.map((v) => ({
    type: "text",
    text: values[v],
    ...(template.named ? { parameter_name: v } : {})
  }));
  const messageId = await postMessage({
    to: phone,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(parameters.length ? { components: [{ type: "body", parameters }] } : {})
    }
  });
  const logged = await logSent(storeId, phone, renderTemplate(template, values), messageId);
  return { messageId, logged };
}

module.exports = {
  SendError,
  BAD_TOKEN,
  sendText,
  listTemplates,
  sendTemplate
};
