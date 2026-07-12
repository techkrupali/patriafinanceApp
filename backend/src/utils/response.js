/** Success: { status: true, ...payload } */
function ok(res, payload = {}) {
  return res.status(200).json({ status: true, ...payload });
}

/**
 * Business/domain failure. The upstream API uses 406 for these
 * (see Postman examples), so we default to it.
 */
function fail(res, message, code = 406, extra = {}) {
  return res.status(code).json({ status: false, message, ...extra });
}

/** Wrap async route handlers so rejections reach the error middleware. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { ok, fail, asyncHandler };
