const path = require("path");
const express = require("express");
const config = require("./config");
const auth = require("./auth");
const mongoClient = require("./mongo-client");
const mockClient = require("./mock-client");

const { DataSourceError } = mongoClient;
const contextService = config.MOCK_DATA ? mockClient : mongoClient;

const PUBLIC_DIR = path.join(__dirname, "..", "public");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

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

app.use((err, req, res, next) => {
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
