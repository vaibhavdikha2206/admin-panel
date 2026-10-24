const {
  CONTEXT_SERVICE_URL,
  CONTEXT_SERVICE_API_KEY,
  CONTEXT_SERVICE_TIMEOUT_MS
} = require("./config");

/*
 * Reads conversations from the customer context service. The API key stays
 * on this server; the browser only ever talks to the admin panel.
 */
class ContextServiceError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function get(path, query = {}) {
  if (!CONTEXT_SERVICE_URL) {
    throw new ContextServiceError(
      "CONTEXT_SERVICE_URL is not set (or start with MOCK_DATA=true)",
      503
    );
  }

  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== "")
  ).toString();

  let res;
  try {
    res = await fetch(`${CONTEXT_SERVICE_URL}${path}${qs ? `?${qs}` : ""}`, {
      headers: CONTEXT_SERVICE_API_KEY
        ? { "x-api-key": CONTEXT_SERVICE_API_KEY }
        : {},
      signal: AbortSignal.timeout(CONTEXT_SERVICE_TIMEOUT_MS)
    });
  } catch (err) {
    throw new ContextServiceError(
      `Customer context service unreachable at ${CONTEXT_SERVICE_URL} (${err.name === "TimeoutError" ? "timed out" : err.message})`,
      502
    );
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = body && (body.error || JSON.stringify(body.details || ""));
    throw new ContextServiceError(
      `Customer context service returned ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status === 401 ? 502 : res.status
    );
  }

  return body;
}

function listCustomers(storeId, { limit, offset } = {}) {
  return get(`/v1/stores/${encodeURIComponent(storeId)}/conversations`, {
    limit,
    offset
  });
}

function listMessages(storeId, customerId, { limit, before } = {}) {
  return get(
    `/v1/stores/${encodeURIComponent(storeId)}/customers/${encodeURIComponent(customerId)}/messages`,
    { limit, before }
  );
}

module.exports = {
  ContextServiceError,
  listCustomers,
  listMessages
};
