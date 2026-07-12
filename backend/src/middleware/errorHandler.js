function notFound(req, res) {
  res.status(404).json({ status: false, message: 'Route not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ status: false, message: 'Invalid JSON body' });
  }
  console.error(`[${new Date().toISOString()}]`, err);
  res.status(500).json({ status: false, message: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
