/** Returns the list of required keys that are missing/empty on body. */
function missingFields(body, fields) {
  return fields.filter((f) => {
    const v = body?.[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

function isDigits(value, minLen = 1, maxLen = 30) {
  const s = String(value ?? '');
  return new RegExp(`^\\d{${minLen},${maxLen}}$`).test(s);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? ''));
}

module.exports = { missingFields, isDigits, isEmail };
