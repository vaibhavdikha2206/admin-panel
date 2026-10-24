const crypto = require("crypto");
const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  SESSION_SECRET,
  SESSION_TTL_HOURS
} = require("./config");

/*
 * Stateless login: the cookie holds "<username>.<expiresAt>.<hmac>", so the
 * server keeps no session store and a restart doesn't log anyone out.
 */
const COOKIE = "admin_session";

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function checkCredentials(username, password) {
  // Both compared, so timing doesn't reveal which one was wrong.
  const userOk = safeEqual(username, ADMIN_USERNAME);
  const passOk = safeEqual(password, ADMIN_PASSWORD);
  return userOk && passOk;
}

function createToken(username) {
  const expiresAt = Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000;
  const payload = `${Buffer.from(username).toString("base64url")}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

// The username if the token is valid and unexpired, else null.
function verifyToken(token) {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [user, expiresAt, signature] = parts;
  if (!safeEqual(signature, sign(`${user}.${expiresAt}`))) return null;
  if (Number(expiresAt) < Date.now()) return null;

  return Buffer.from(user, "base64url").toString();
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const pair of header.split(";")) {
    const i = pair.indexOf("=");
    if (i > -1 && pair.slice(0, i).trim() === name) {
      return decodeURIComponent(pair.slice(i + 1).trim());
    }
  }
  return null;
}

function setSessionCookie(req, res, username) {
  res.cookie(COOKIE, createToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE);
}

function currentUser(req) {
  return verifyToken(readCookie(req, COOKIE));
}

// For JSON routes: 401 when not logged in.
function requireLogin(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: "Not logged in" });
  }
  req.user = user;
  next();
}

module.exports = {
  checkCredentials,
  setSessionCookie,
  clearSessionCookie,
  currentUser,
  requireLogin
};
