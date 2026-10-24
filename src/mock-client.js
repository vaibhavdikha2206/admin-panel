const dummy = require("./dummy-conversations");

/*
 * Same responses as context-client.js, built from dummy-conversations.js,
 * for trying the panel without the customer context service.
 */
const startedAt = Date.now();

function isoMinutesAgo(minutes) {
  return new Date(startedAt - minutes * 60 * 1000).toISOString();
}

function messagesOf(customer) {
  return customer.exchanges.map((e, i) => ({
    id: `mock-${customer.customerId}-${i}`,
    message: e.message,
    response: e.response,
    messageId: `wamid.MOCK${customer.customerId}${i}`,
    customerName: i === 0 ? customer.customerName : null,
    metadata: e.metadata || {},
    createdAt: isoMinutesAgo(e.minutesAgo)
  }));
}

async function listCustomers(storeId, { limit = 100, offset = 0 } = {}) {
  const customers = dummy
    .map((c) => {
      const msgs = messagesOf(c);
      return {
        customerId: c.customerId,
        customerName: c.customerName,
        firstMessageAt: msgs[0].createdAt,
        lastMessageAt: msgs[msgs.length - 1].createdAt,
        messageCount: msgs.length
      };
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

  return {
    storeId,
    total: customers.length,
    limit: Number(limit),
    offset: Number(offset),
    customers: customers.slice(Number(offset), Number(offset) + Number(limit))
  };
}

async function listMessages(storeId, customerId, { limit = 50, before } = {}) {
  const customer = dummy.find((c) => c.customerId === customerId);
  let msgs = customer ? messagesOf(customer) : [];

  if (before) msgs = msgs.filter((m) => m.createdAt < before);

  const page = msgs.slice(-Number(limit));
  const hasMore = msgs.length > page.length;

  return {
    storeId,
    customerId,
    hasMore,
    nextBefore: hasMore ? page[0].createdAt : null,
    messages: page
  };
}

module.exports = {
  listCustomers,
  listMessages
};
