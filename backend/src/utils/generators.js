const crypto = require('crypto');

function randDigits(n) {
  let s = '';
  while (s.length < n) s += crypto.randomInt(0, 10);
  return s;
}

function randAlnum(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[crypto.randomInt(0, chars.length)];
  return s;
}

/** 10-digit NUBAN-style account number starting with 50 */
function accountNumber() {
  return '50' + randDigits(8);
}

/** e.g. ASM219056223071 */
function transactionReference(prefix = 'ASM') {
  return prefix + Date.now().toString().slice(-9) + randDigits(4);
}

function luhnCheckDigit(partial) {
  let sum = 0;
  let dbl = true; // rightmost digit of the full PAN is the check digit, so start doubling here
  for (let i = partial.length - 1; i >= 0; i--) {
    let d = Number(partial[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return String((10 - (sum % 10)) % 10);
}

/** 18-digit Luhn-valid PAN on our 5640206 BIN */
function cardNumber() {
  const partial = '5640206' + randDigits(10);
  return partial + luhnCheckDigit(partial);
}

function maskPan(pan) {
  return pan.slice(0, 8) + '******' + pan.slice(-4);
}

function cardCvv() {
  return randDigits(3);
}

/** MM/YY, 4 years from now */
function cardExpiry() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 4);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

function loanCode() {
  return randDigits(8);
}

function apiKey() {
  return randAlnum(32);
}

function accountReference() {
  return randAlnum(20);
}

function sessionId() {
  return randDigits(30);
}

module.exports = {
  randDigits,
  accountNumber,
  transactionReference,
  cardNumber,
  maskPan,
  cardCvv,
  cardExpiry,
  loanCode,
  apiKey,
  accountReference,
  sessionId,
};
