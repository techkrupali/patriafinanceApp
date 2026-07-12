const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { fail, asyncHandler } = require('../utils/response');

/** Bearer-token auth. Attaches req.user (Prisma User). */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 'Authentication token missing', 401);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return fail(res, 'Invalid or expired token', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userid } });
  if (!user || user.status_id !== 1) return fail(res, 'Account not found or inactive', 401);

  req.user = user;
  next();
});

/** Server-to-server auth via x-api-key header. Attaches req.apiUser. */
const requireApiKey = asyncHandler(async (req, res, next) => {
  const key = req.headers['x-api-key'] || req.headers['api_key'];
  if (!key) return fail(res, 'API key missing', 401);

  const user = await prisma.user.findUnique({ where: { api_key: String(key) } });
  if (!user || user.status_id !== 1) return fail(res, 'Invalid API key', 401);

  req.apiUser = user;
  next();
});

function signToken(user) {
  return jwt.sign({ userid: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

module.exports = { requireAuth, requireApiKey, signToken };
