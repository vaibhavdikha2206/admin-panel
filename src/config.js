require("dotenv").config();

const PORT = Number(process.env.PORT) || 4000;

const CONTEXT_SERVICE_URL =
  (process.env.CONTEXT_SERVICE_URL || "").replace(/\/+$/, "");

const CONTEXT_SERVICE_API_KEY = process.env.CONTEXT_SERVICE_API_KEY || "";

const CONTEXT_SERVICE_TIMEOUT_MS =
  Number(process.env.CONTEXT_SERVICE_TIMEOUT_MS) || 8000;

const STORE_IDS = (process.env.STORE_IDS || "little-bansi")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const SESSION_SECRET = process.env.SESSION_SECRET || "change-me";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 12;

const NODE_ENV = process.env.NODE_ENV || "production";

// NODE_ENV=mock (or `npm run mock`) serves dummy conversations, so the panel
// can be tried without a database. Anything else reads MongoDB.
const MOCK_DATA = process.argv.includes("--mock") || NODE_ENV === "mock";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || "";

// Replies typed in the panel go out through Meta's Graph API, from the same
// number as the bot (see wa-faq-cloud's src/whatsapp.js).
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "";
const GRAPH_URL = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
const GRAPH_TIMEOUT_MS = Number(process.env.GRAPH_TIMEOUT_MS) || 10000;

module.exports = {
  PORT,
  CONTEXT_SERVICE_URL,
  CONTEXT_SERVICE_API_KEY,
  CONTEXT_SERVICE_TIMEOUT_MS,
  STORE_IDS,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  SESSION_SECRET,
  SESSION_TTL_HOURS,
  NODE_ENV,
  MOCK_DATA,
  MONGODB_URI,
  MONGODB_DATABASE,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  GRAPH_URL,
  GRAPH_TIMEOUT_MS
};
