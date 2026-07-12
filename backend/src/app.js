const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Safety net: BigInt values are serialized as strings if one ever leaks into a response.
app.set('json replacer', (key, value) => (typeof value === 'bigint' ? value.toString() : value));

app.get('/', (req, res) => {
  res.json({ status: true, message: 'matrixbankingAPI is running', version: 'v1' });
});

// Postman collection uses both /api/v1/... and /matrixbanking/api/v1/...
app.use('/api/v1', routes);
app.use('/matrixbanking/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
