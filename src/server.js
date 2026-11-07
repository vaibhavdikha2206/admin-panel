const path = require("path");
const express = require("express");
const config = require("./config");
const auth = require("./auth");
const mongoClient = require("./mongo-client");
const mockClient = require("./mock-client");
const whatsapp = require("./whatsapp");
const broadcast = require("./broadcast");

const { DataSourceError } = mongoClient;
const contextService = config.MOCK_DATA ? mockClient : mongoClient;

const PUBLIC_DIR = path.join(__dirname, "..", "public");

const app = express();

app.disable("x-powered-by");
// Room for a broadcast to a few thousand picked numbers.
app.use(express.json({ limit: "100kb" }));

/*
 * Pages. "/" is the chat panel and needs a login; "/login" is public.
 */
app.get("/", (req, res) => {
  if (!auth.currentUser(req)) return res.redirect("/login");
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/login", (req, res) => {
  if (auth.currentUser(req)) return res.redirect("/");
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

// CSS/JS only; the HTML pages go through the routes above.
app.use(express.static(PUBLIC_DIR, { index: false }));

/*
 * Auth API.
 */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!auth.checkCredentials(username || "", password || "")) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid username or password" });
  }

  auth.setSessionCookie(req, res, username);
  res.json({ success: true });
});

app.post("/api/logout", (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ success: true });
});

app.get("/api/me", auth.requireLogin, (req, res) => {
  res.json({
    username: req.user,
    stores: config.STORE_IDS,
    mock: config.MOCK_DATA
  });
});

/*
 * Conversations, read from MongoDB (or the dummy data in mock mode).
 */
app.use("/api/stores/:storeId", auth.requireLogin, (req, res, next) => {
  if (!config.STORE_IDS.includes(req.params.storeId)) {
    return res.status(404).json({ success: false, error: "Unknown store" });
  }
  next();
});

app.get("/api/stores/:storeId/conversations", async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    res.json(
      await contextService.listCustomers(req.params.storeId, { limit, offset })
    );
  } catch (err) {
    next(err);
  }
});

app.get(
  "/api/stores/:storeId/customers/:customerId/messages",
  async (req, res, next) => {
    try {
      const { limit, before } = req.query;
      res.json(
        await contextService.listMessages(
          req.params.storeId,
          req.params.customerId,
          { limit, before }
        )
      );
    } catch (err) {
      next(err);
    }
  }
);

const MAX_REPLY_LENGTH = 4096; // WhatsApp's limit for a text message

app.post(
  "/api/stores/:storeId/customers/:customerId/messages",
  async (req, res, next) => {
    try {
      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      if (!text) {
        return res.status(400).json({ success: false, error: "Message is empty" });
      }
      if (text.length > MAX_REPLY_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `Message is longer than ${MAX_REPLY_LENGTH} characters`
        });
      }
      if (!/^\d{6,15}$/.test(req.params.customerId)) {
        return res.status(400).json({ success: false, error: "Not a WhatsApp number" });
      }
      if (config.MOCK_DATA) {
        return res.status(400).json({ success: false, error: "Sending is off in mock mode" });
      }

      const sent = await whatsapp.sendText(req.params.storeId, req.params.customerId, text);
      console.log(`[send] by ${req.user}`);
      res.json({ success: true, ...sent });
    } catch (err) {
      next(err);
    }
  }
);

/*
 * Broadcasts: an approved template to the whole store or picked customers.
 */
const MAX_VARIABLE_LENGTH = 1024;
const isPhone = (id) => typeof id === "string" && /^\d{6,15}$/.test(id);

app.get("/api/stores/:storeId/templates", async (req, res, next) => {
  try {
    res.json({ templates: await whatsapp.listTemplates() });
  } catch (err) {
    next(err);
  }
});

app.post("/api/stores/:storeId/broadcasts", async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { name, language, values = {}, recipients } = req.body || {};

    if (config.MOCK_DATA) {
      return res.status(400).json({ success: false, error: "Sending is off in mock mode" });
    }
    const running = broadcast.runningFor(storeId);
    if (running) {
      return res.status(409).json({ success: false, error: "A broadcast is already running for this store", broadcast: running });
    }

    // Checked against Meta's list, not the browser's copy of it.
    const template = (await whatsapp.listTemplates()).find(
      (t) => t.name === name && t.language === language
    );
    if (!template) {
      return res.status(400).json({ success: false, error: "Template not found or not approved" });
    }
    if (template.unsupported) {
      return res.status(400).json({ success: false, error: `Template not supported yet (${template.unsupported})` });
    }

    const filled = {};
    for (const v of template.variables) {
      const value = typeof values[v] === "string" ? values[v].trim() : "";
      if (!value) {
        return res.status(400).json({ success: false, error: `Fill in {{${v}}}` });
      }
      if (value.length > MAX_VARIABLE_LENGTH || /[\n\t]| {5,}/.test(value)) {
        // Meta rejects new lines, tabs and 5+ spaces in a variable.
        return res.status(400).json({ success: false, error: `{{${v}}} can't have line breaks, tabs or long runs of spaces` });
      }
      filled[v] = value;
    }

    let phones;
    if (recipients === "all") {
      phones = await contextService.listCustomerIds(storeId);
    } else if (Array.isArray(recipients) && recipients.length && recipients.every(isPhone)) {
      phones = await contextService.listCustomerIds(storeId, [...new Set(recipients)]);
    } else {
      return res.status(400).json({ success: false, error: "Pick at least one customer" });
    }
    phones = phones.filter(isPhone);
    if (!phones.length) {
      return res.status(400).json({ success: false, error: "No customers to send to" });
    }

    res.json({
      success: true,
      broadcast: broadcast.start({ storeId, template, values: filled, recipients: phones, by: req.user })
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/stores/:storeId/broadcasts/:id", (req, res) => {
  const job = broadcast.get(req.params.storeId, req.params.id);
  if (!job) return res.status(404).json({ success: false, error: "Broadcast not found" });
  res.json({ broadcast: job });
});

app.post("/api/stores/:storeId/broadcasts/:id/stop", (req, res) => {
  const job = broadcast.stop(req.params.storeId, req.params.id);
  if (!job) return res.status(404).json({ success: false, error: "Broadcast not found" });
  console.log(`[broadcast] ${job.id} stop requested by ${req.user}`);
  res.json({ broadcast: job });
});

app.use((err, req, res, next) => {
  if (err instanceof whatsapp.SendError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }

  if (err instanceof DataSourceError) {
    console.error(`[mongodb] ${err.message}`);
    return res.status(err.status).json({ success: false, error: err.message });
  }

  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error" });
});

const server = app.listen(config.PORT, () => {
  console.log(`Admin panel on http://localhost:${config.PORT}`);
  console.log(
    config.MOCK_DATA
      ? "Data: MOCK (dummy conversations)"
      : `Data: MongoDB database "${config.MONGODB_DATABASE || "(MONGODB_DATABASE not set)"}"`
  );
  console.log(`Stores: ${config.STORE_IDS.join(", ")}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    mongoClient.close().finally(() => process.exit(0));
  });
}
