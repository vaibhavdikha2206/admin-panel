/*
 * WhatsApp-style viewer for the bot's conversations. Talks only to the admin
 * panel's own /api routes, which proxy the customer context service.
 */
const PAGE_SIZE = 50;
const POLL_MS = 20000;

const state = {
  storeId: null,
  customers: [],
  selectedId: null,
  messages: [],
  hasMore: false,
  nextBefore: null,
  loadingOlder: false
};

const $ = (id) => document.getElementById(id);

const els = {
  app: $("app"),
  storeSelect: $("store-select"),
  meAvatar: $("me-avatar"),
  mockBanner: $("mock-banner"),
  search: $("search"),
  list: $("chat-list"),
  listStatus: $("list-status"),
  empty: $("chat-empty"),
  view: $("chat-view"),
  chatAvatar: $("chat-avatar"),
  chatName: $("chat-name"),
  chatSub: $("chat-sub"),
  messages: $("messages")
};

/* ---------- API ---------- */

async function api(path) {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (res.status === 401) {
    location.href = "/login";
    throw new Error("Not logged in");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const storePath = () => `/api/stores/${encodeURIComponent(state.storeId)}`;

/* ---------- Formatting ---------- */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// WhatsApp-style *bold*, _italic_, ~strike~ on already-escaped text.
function formatText(s) {
  return escapeHtml(s)
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?])/g, "$1<strong>$2</strong>")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?])/g, "$1<em>$2</em>")
    .replace(/(^|\s)~([^~\n]+)~(?=\s|$|[.,!?])/g, "$1<s>$2</s>");
}

// 919876543210 -> +91 98765 43210 (Indian numbers); others just get a "+".
function formatPhone(id) {
  const m = /^91(\d{5})(\d{5})$/.exec(id);
  if (m) return `+91 ${m[1]} ${m[2]}`;
  return /^\d+$/.test(id) ? `+${id}` : id;
}

const displayName = (c) => c.customerName || formatPhone(c.customerId);

function initials(c) {
  if (!c.customerName) return "#";
  const parts = c.customerName.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

// A stable colour per customer, like WhatsApp's default avatars.
const AVATAR_COLOURS = ["#00a884", "#53bdeb", "#ff7e6b", "#a791ff", "#ffb84d", "#3eb489", "#e86fa3", "#5b8def"];
function avatarColour(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}

const sameDay = (a, b) => a.toDateString() === b.toDateString();

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  const opts = { day: "numeric", month: "long" };
  if (date.getFullYear() !== today.getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString([], opts);
}

// Chat-list timestamp: time today, "Yesterday", else a short date.
function listTime(iso) {
  const d = new Date(iso);
  const label = dayLabel(d);
  if (label === "Today") return timeOf(iso);
  if (label === "Yesterday") return label;
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/* ---------- Customer list ---------- */

function renderList() {
  const q = els.search.value.trim().toLowerCase();
  const shown = state.customers.filter((c) =>
    !q ||
    (c.customerName || "").toLowerCase().includes(q) ||
    c.customerId.includes(q.replace(/\D/g, "") || q)
  );

  els.list.innerHTML = shown
    .map((c) => `
      <li class="chat-item${c.customerId === state.selectedId ? " active" : ""}" data-id="${escapeHtml(c.customerId)}" tabindex="0">
        <div class="avatar" style="background:${avatarColour(c.customerId)}">${escapeHtml(initials(c))}</div>
        <div class="chat-item-body">
          <div class="chat-item-row">
            <span class="chat-item-name">${escapeHtml(displayName(c))}</span>
            <span class="chat-item-time">${c.lastMessageAt ? listTime(c.lastMessageAt) : ""}</span>
          </div>
          <div class="chat-item-row">
            <span class="chat-item-sub">${c.customerName ? escapeHtml(formatPhone(c.customerId)) : "No profile name"}</span>
            <span class="count-badge" title="Messages">${c.messageCount ?? ""}</span>
          </div>
        </div>
      </li>`)
    .join("");

  els.listStatus.classList.remove("error");
  if (!state.customers.length) {
    els.listStatus.textContent = "No customers have messaged this store yet.";
  } else if (!shown.length) {
    els.listStatus.textContent = "No customers match your search.";
  } else {
    els.listStatus.textContent = "";
  }
}

async function loadCustomers({ quiet = false } = {}) {
  if (!quiet) {
    els.list.innerHTML = "";
    els.listStatus.classList.remove("error");
    els.listStatus.textContent = "Loading customers…";
  }
  try {
    const data = await api(`${storePath()}/conversations?limit=500`);
    state.customers = data.customers || [];
    renderList();
    if (state.selectedId) renderChatHeader();
  } catch (err) {
    if (quiet) return;
    els.listStatus.classList.add("error");
    els.listStatus.textContent = err.message;
  }
}

/* ---------- Conversation ---------- */

function selectedCustomer() {
  return (
    state.customers.find((c) => c.customerId === state.selectedId) ||
    { customerId: state.selectedId, customerName: null }
  );
}

function renderChatHeader() {
  const c = selectedCustomer();
  els.chatAvatar.textContent = initials(c);
  els.chatAvatar.style.background = avatarColour(c.customerId);
  els.chatName.textContent = displayName(c);

  const sub = [];
  if (c.customerName) sub.push(formatPhone(c.customerId));
  if (c.messageCount != null) sub.push(`${c.messageCount} message${c.messageCount === 1 ? "" : "s"}`);
  if (c.firstMessageAt) sub.push(`since ${new Date(c.firstMessageAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`);
  els.chatSub.textContent = sub.join(" · ");
}

/* ---------- Bot replies ---------- */

// The bot logs each message it sends as text (describeMessage in wa-faq-cloud's
// src/whatsapp.js), several to one exchange joined by a blank line:
//   [image] <url>                       a photo, or an interactive message's header
//   [ Title ] (id)  [ Title ] (id)      reply buttons
//   [ Label ▾ ]  then  "  • row — description (id)"   a list
//   [ Label ] -> <url>                  a link button
//   "  [image] <url>", "  body", "  [ Title ] (id)"   a carousel card
// parseBotMessages turns that back into the messages the customer saw.
const IMAGE_LINE = /^\[image\] (\S+)$/;
const CARD_IMAGE_LINE = /^ {2}\[image\] (\S+)$/;
const BUTTON_ROW = /^(\[ .+? \] \([^)]*\)\s*)+$/;
const BUTTON = /\[ (.+?) \] \(([^)]*)\)/g;
const LIST_BUTTON_LINE = /^\[ (.+) ▾ \]$/;
const LIST_ROW_LINE = /^ {2}• (.+?)(?: — (.*))? \(([^)]*)\)$/;
const LINK_LINE = /^\[ (.+?) \] -> (\S+)$/;

const buttonsOf = (line) => [...line.matchAll(BUTTON)].map((b) => ({ title: b[1], id: b[2] }));

function parseBotMessages(response) {
  const out = [];
  let cur = null;
  // A photo ends at a blank line, but a header photo's body can hold blank
  // lines too: when buttons turn up after one, they belong to that photo.
  let lastPhoto = null;

  const start = () => (cur = { text: [], image: null, buttons: [], list: null, link: null, cards: [] });
  const finish = () => {
    if (!cur) return;
    cur.text = cur.text.join("\n").trim();
    out.push(cur);
    lastPhoto = cur.image && !cur.buttons.length && !cur.link ? cur : null;
    cur = null;
  };
  // The text gathered since lastPhoto closed, back into its body.
  const reopenPhoto = () => {
    if (!lastPhoto || out[out.length - 1] !== lastPhoto) return false;
    if (cur && (cur.image || cur.list || cur.cards.length)) return false;
    out.pop();
    const extra = cur ? cur.text.join("\n").trim() : "";
    cur = { ...lastPhoto, text: [lastPhoto.text, extra].filter(Boolean).join("\n\n").split("\n") };
    return true;
  };

  for (const line of response.split("\n")) {
    const card = cur && cur.cards[cur.cards.length - 1];
    let m;
    if ((m = CARD_IMAGE_LINE.exec(line))) {
      if (!cur) start();
      cur.cards.push({ image: m[1], body: [], buttons: [], open: true });
    } else if (card && card.open) {
      if (line.startsWith("  ") && BUTTON_ROW.test(line.trim())) {
        card.buttons = buttonsOf(line);
        card.open = false;
      } else {
        card.body.push(line.replace(/^ {2}/, ""));
      }
    } else if ((m = IMAGE_LINE.exec(line))) {
      finish();
      start();
      cur.image = m[1];
    } else if (cur && cur.list && (m = LIST_ROW_LINE.exec(line))) {
      cur.list.rows.push({ title: m[1], description: m[2] || "", id: m[3] });
    } else if (BUTTON_ROW.test(line)) {
      if (!reopenPhoto() && !cur) start();
      cur.buttons = buttonsOf(line);
      finish();
    } else if ((m = LINK_LINE.exec(line))) {
      if (!reopenPhoto() && !cur) start();
      cur.link = { title: m[1], url: m[2] };
      finish();
    } else if ((m = LIST_BUTTON_LINE.exec(line))) {
      if (!cur) start();
      cur.list = { button: m[1], rows: [] };
    } else if (!line.trim()) {
      // Ends a photo, list or carousel; inside plain text it is a paragraph break.
      if (cur && (cur.image || cur.list || cur.cards.length)) finish();
      else if (cur) cur.text.push("");
    } else {
      if (cur && (cur.list || cur.cards.length)) finish();
      if (!cur) start();
      cur.text.push(line);
    }
  }
  finish();

  for (const msg of out) {
    for (const c of msg.cards) c.body = c.body.join("\n").trim();
  }
  return out.filter((msg) => msg.text || msg.image || msg.buttons.length || msg.list || msg.link || msg.cards.length);
}

// Only web links make it into src/href.
function safeUrl(url) {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : "";
}

function imageHtml(url, cls) {
  const src = safeUrl(url);
  if (!src) return "";
  return `<a class="${cls}" href="${src}" target="_blank" rel="noopener noreferrer"><img src="${src}" alt="" loading="lazy"></a>`;
}

function buttonsHtml(buttons) {
  if (!buttons.length) return "";
  return `<div class="msg-buttons">${buttons
    .map((b) => `<span class="msg-button" title="${escapeHtml(b.id)}">${escapeHtml(b.title)}</span>`)
    .join("")}</div>`;
}

function listHtml(list) {
  const rows = list.rows
    .map((r) => `
      <li title="${escapeHtml(r.id)}">
        <span class="list-row-title">${escapeHtml(r.title)}</span>
        ${r.description ? `<span class="list-row-desc">${escapeHtml(r.description)}</span>` : ""}
      </li>`)
    .join("");
  return `
    <details class="msg-list">
      <summary class="msg-button">☰ ${escapeHtml(list.button)}</summary>
      <ul>${rows}</ul>
    </details>`;
}

function linkHtml(link) {
  const href = safeUrl(link.url);
  const title = `↗ ${escapeHtml(link.title)}`;
  return `<div class="msg-buttons">${href
    ? `<a class="msg-button" href="${href}" target="_blank" rel="noopener noreferrer" title="${href}">${title}</a>`
    : `<span class="msg-button">${title}</span>`}</div>`;
}

function cardHtml(card) {
  return `
    <div class="card">
      ${imageHtml(card.image, "card-img")}
      ${card.body ? `<div class="card-body">${formatText(card.body)}</div>` : ""}
      ${buttonsHtml(card.buttons)}
    </div>`;
}

// One exchange's bot side: a bubble per message (a carousel is its text
// bubble plus a row of cards), "Bot" on the first, the time on the last.
function botRepliesHtml(response, footer) {
  const messages = parseBotMessages(response);
  const label = `<div class="bubble-label">Bot</div>`;
  const meta = `<div class="bubble-meta">${footer}</div>`;
  let html = "";

  messages.forEach((msg, i) => {
    const first = i === 0;
    const last = i === messages.length - 1;
    const cards = msg.cards.length > 0;

    const parts = [];
    if (msg.image) parts.push(imageHtml(msg.image, "bubble-img"));
    if (msg.text) parts.push(`<div class="bubble-text">${formatText(msg.text)}</div>`);
    if (msg.list) parts.push(listHtml(msg.list));

    if (parts.length || !cards) {
      html += `
      <div class="msg-row out">
        <div class="bubble${msg.image ? " has-img" : ""}">
          ${first ? label : ""}
          ${parts.join("")}
          ${last && !cards ? meta : ""}
          ${buttonsHtml(msg.buttons)}
          ${msg.link ? linkHtml(msg.link) : ""}
        </div>
      </div>`;
    }

    if (cards) {
      html += `
      <div class="msg-row out">
        <div class="carousel-wrap">
          ${first && !parts.length ? label : ""}
          <div class="carousel">${msg.cards.map(cardHtml).join("")}</div>
          ${last ? meta : ""}
        </div>
      </div>`;
    }
  });

  return html;
}

function metaChips(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  const chips = [];
  if (metadata.intent) chips.push(`<span class="chip" title="Intent">${escapeHtml(metadata.intent)}</span>`);
  return chips.join("");
}

// scroll: "bottom" (open a chat), "keep" (older page added on top) or
// "follow" (new messages: go to the bottom only if already there).
function renderMessages({ scroll = "bottom" } = {}) {
  const box = els.messages;
  const prevHeight = box.scrollHeight;
  const prevTop = box.scrollTop;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

  let html = "";

  if (state.hasMore) {
    html += `<div class="load-older"><button id="load-older" ${state.loadingOlder ? "disabled" : ""}>${state.loadingOlder ? "Loading…" : "Load older messages"}</button></div>`;
  }

  if (!state.messages.length) {
    html += `<div class="messages-status">No messages stored for this customer. Messages are kept for 7 days.</div>`;
  }

  let lastDay = null;
  for (const m of state.messages) {
    const date = new Date(m.createdAt);
    if (!lastDay || !sameDay(lastDay, date)) {
      html += `<div class="day-sep"><span>${dayLabel(date)}</span></div>`;
      lastDay = date;
    }

    const time = timeOf(m.createdAt);

    // No customer message: the bot wrote first (a nudge).
    if (m.message) {
      html += `
      <div class="msg-row in">
        <div class="bubble">
          <div class="bubble-text">${formatText(m.message)}</div>
          <div class="bubble-meta">${time}</div>
        </div>
      </div>`;
    }

    const footer = `${metaChips(m.metadata)}<span>${time}</span>`;
    const replies = m.response ? botRepliesHtml(m.response, footer) : "";
    html += replies || `
      <div class="msg-row out">
        <div class="bubble">
          <div class="bubble-label">Bot</div>
          <div class="bubble-text"><span class="no-reply">No reply recorded</span></div>
          <div class="bubble-meta">${footer}</div>
        </div>
      </div>`;
  }

  box.innerHTML = html;

  const older = $("load-older");
  if (older) older.addEventListener("click", loadOlder);

  if (scroll === "keep") {
    box.scrollTop = box.scrollHeight - prevHeight + prevTop;
  } else if (scroll === "bottom" || atBottom) {
    box.scrollTop = box.scrollHeight;
  }
}

function messagesPath(before) {
  const params = new URLSearchParams({ limit: PAGE_SIZE });
  if (before) params.set("before", before);
  return `${storePath()}/customers/${encodeURIComponent(state.selectedId)}/messages?${params}`;
}

async function openCustomer(customerId) {
  state.selectedId = customerId;
  state.messages = [];
  state.hasMore = false;
  state.nextBefore = null;

  els.app.classList.add("show-chat");
  els.empty.hidden = true;
  els.view.hidden = false;
  renderList();
  renderChatHeader();
  els.messages.innerHTML = `<div class="messages-status">Loading messages…</div>`;

  history.replaceState(null, "", `#${encodeURIComponent(state.storeId)}/${encodeURIComponent(customerId)}`);

  try {
    const data = await api(messagesPath());
    if (state.selectedId !== customerId) return; // switched chats meanwhile
    state.messages = data.messages || [];
    state.hasMore = Boolean(data.hasMore);
    state.nextBefore = data.nextBefore;
    renderMessages();
  } catch (err) {
    if (state.selectedId !== customerId) return;
    els.messages.innerHTML = `<div class="messages-status error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadOlder() {
  if (state.loadingOlder || !state.nextBefore) return;
  const customerId = state.selectedId;
  state.loadingOlder = true;
  renderMessages({ scroll: "keep" });

  try {
    const data = await api(messagesPath(state.nextBefore));
    if (state.selectedId !== customerId) return;
    state.messages = [...(data.messages || []), ...state.messages];
    state.hasMore = Boolean(data.hasMore);
    state.nextBefore = data.nextBefore;
  } catch (err) {
    alert(err.message);
  } finally {
    state.loadingOlder = false;
    if (state.selectedId === customerId) renderMessages({ scroll: "keep" });
  }
}

// Picks up new messages in the open chat without losing older pages.
async function refreshOpenChat() {
  const customerId = state.selectedId;
  if (!customerId || state.loadingOlder) return;
  try {
    const data = await api(messagesPath());
    if (state.selectedId !== customerId) return;
    const known = new Set(state.messages.map((m) => m.id));
    const fresh = (data.messages || []).filter((m) => !known.has(m.id));
    if (!fresh.length) return;
    state.messages = [...state.messages, ...fresh].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    renderMessages({ scroll: "follow" });
  } catch {
    // Polling stays quiet; the next manual refresh shows the error.
  }
}

function closeChat() {
  state.selectedId = null;
  els.app.classList.remove("show-chat");
  els.view.hidden = true;
  els.empty.hidden = false;
  history.replaceState(null, "", `#${encodeURIComponent(state.storeId)}`);
  renderList();
}

/* ---------- Wiring ---------- */

els.list.addEventListener("click", (e) => {
  const item = e.target.closest(".chat-item");
  if (item) openCustomer(item.dataset.id);
});

els.list.addEventListener("keydown", (e) => {
  const item = e.target.closest(".chat-item");
  if (item && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    openCustomer(item.dataset.id);
  }
});

els.search.addEventListener("input", renderList);

els.storeSelect.addEventListener("change", async () => {
  state.storeId = els.storeSelect.value;
  closeChat();
  await loadCustomers();
});

$("refresh-btn").addEventListener("click", async () => {
  await loadCustomers();
  if (state.selectedId) openCustomer(state.selectedId);
});

$("back-btn").addEventListener("click", closeChat);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.selectedId) closeChat();
});

$("logout-btn").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login";
});

async function init() {
  const me = await api("/api/me");

  els.meAvatar.textContent = me.username[0].toUpperCase();
  els.meAvatar.title = `Signed in as ${me.username}`;
  els.mockBanner.hidden = !me.mock;

  els.storeSelect.innerHTML = me.stores
    .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
    .join("");

  // Restore "#store/customer" from the URL, so a reload keeps the open chat.
  const [hashStore, hashCustomer] = location.hash
    .slice(1)
    .split("/")
    .map(decodeURIComponent);

  state.storeId = me.stores.includes(hashStore) ? hashStore : me.stores[0];
  els.storeSelect.value = state.storeId;

  await loadCustomers();
  if (hashStore === state.storeId && hashCustomer) openCustomer(hashCustomer);

  setInterval(() => {
    if (document.hidden) return;
    loadCustomers({ quiet: true });
    refreshOpenChat();
  }, POLL_MS);
}

init().catch((err) => {
  els.listStatus.classList.add("error");
  els.listStatus.textContent = err.message;
});
