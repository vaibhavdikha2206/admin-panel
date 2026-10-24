const { MongoClient, ServerApiVersion } = require("mongodb");
const { MONGODB_URI, MONGODB_DATABASE } = require("./config");

/*
 * Reads conversations straight from the customer context service's MongoDB
 * (see docs/CONVERSATION_TABLES.md). Read-only: the context service owns the
 * collections and their indexes. Responses match context-client.js.
 */
const MESSAGES = "conversation_messages";
const CUSTOMERS = "conversation_customers";

class DataSourceError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let client = null;
let dbPromise = null;

function getDb() {
  if (!MONGODB_URI || !MONGODB_DATABASE) {
    return Promise.reject(
      new DataSourceError("MONGODB_URI / MONGODB_DATABASE are not set", 503)
    );
  }

  if (!dbPromise) {
    client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      },
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });

    dbPromise = client
      .connect()
      .then(() => client.db(MONGODB_DATABASE))
      .catch((err) => {
        // Let the next request try again.
        client = null;
        dbPromise = null;
        throw new DataSourceError(`MongoDB unreachable (${err.message})`, 502);
      });
  }

  return dbPromise;
}

// Same bounds as the context service's query validation.
function intParam(value, { min, max, fallback }) {
  const n = Number(value);
  if (value === undefined || value === "" || !Number.isInteger(n)) {
    return fallback;
  }
  return Math.min(Math.max(n, min), max);
}

async function listCustomers(storeId, { limit, offset } = {}) {
  const db = await getDb();

  limit = intParam(limit, { min: 1, max: 500, fallback: 100 });
  offset = intParam(offset, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });

  const filter = { storeId };

  const [customers, total] = await Promise.all([
    db
      .collection(CUSTOMERS)
      .find(filter, {
        projection: {
          _id: 0,
          customerId: 1,
          customerName: 1,
          firstMessageAt: 1,
          lastMessageAt: 1,
          messageCount: 1
        }
      })
      .sort({ lastMessageAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),

    db.collection(CUSTOMERS).countDocuments(filter)
  ]);

  return {
    storeId,
    total,
    limit,
    offset,
    customers
  };
}

/*
 * The newest `limit` messages (optionally older than `before`), returned
 * oldest-first so they read as a conversation.
 */
async function listMessages(storeId, customerId, { limit, before } = {}) {
  const db = await getDb();

  limit = intParam(limit, { min: 1, max: 500, fallback: 50 });

  const filter = { storeId, customerId };

  if (before) {
    const beforeDate = new Date(before);
    if (Number.isNaN(beforeDate.getTime())) {
      throw new DataSourceError("Invalid 'before' timestamp", 400);
    }
    filter.createdAt = { $lt: beforeDate };
  }

  // One extra tells us whether an older page exists.
  const docs = await db
    .collection(MESSAGES)
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit).reverse();

  return {
    storeId,
    customerId,
    hasMore,
    // Pass as ?before= to fetch the previous page.
    nextBefore: hasMore && page.length ? page[0].createdAt.toISOString() : null,
    messages: page.map(toMessage)
  };
}

function toMessage(doc) {
  return {
    id: doc._id.toString(),
    message: doc.message,
    response: doc.response,
    messageId: doc.messageId,
    customerName: doc.customerName,
    metadata: doc.metadata || {},
    createdAt: doc.createdAt
  };
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    dbPromise = null;
  }
}

module.exports = {
  DataSourceError,
  listCustomers,
  listMessages,
  close
};
