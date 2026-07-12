const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { ok, fail } = require('../../utils/response');
const { missingFields, isDigits } = require('../../utils/validate');
const gen = require('../../utils/generators');
const { toKobo, toNairaNumber, toNairaString } = require('../../utils/money');

const MOCK_EXTERNAL = () => String(process.env.MOCK_EXTERNAL_PROVIDERS || 'true') === 'true';

const CABLE_PLANS = {
  gotv: { cable_tv: 'GOTV', current_bouquet: 'GOtv Supa - monthly N5,500', current_bouquet_code: 'gotv-supa', renewal_amount: '3229' },
  dstv: { cable_tv: 'DSTV', current_bouquet: 'DStv Compact - monthly N19,000', current_bouquet_code: 'dstv-compact', renewal_amount: '19000' },
  startimes: { cable_tv: 'STARTIMES', current_bouquet: 'Startimes Basic - monthly N4,000', current_bouquet_code: 'startimes-basic', renewal_amount: '4000' },
};

const MOCK_CUSTOMERS = ['RASAQ LAWAL', 'BUKOLA ADEYEMI', 'SAMUEL OKAFOR', 'MARYAM SULE', 'PETER OBIANO'];

// POST /transactions/verify-smart-card
async function verifySmartCard(req, res) {
  const missing = missingFields(req.body, ['smart_card_number', 'cable_tv_type']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { smart_card_number, cable_tv_type } = req.body;
  const plan = CABLE_PLANS[String(cable_tv_type).toLowerCase()];
  if (!plan) return fail(res, 'Unsupported cable tv type');
  if (!isDigits(smart_card_number, 8, 12)) return fail(res, 'Invalid smart card number');
  if (!MOCK_EXTERNAL()) return fail(res, 'Cable TV verification unavailable', 503);

  const digitSum = String(smart_card_number).split('').reduce((a, c) => a + Number(c), 0);
  return ok(res, {
    message: 'Cable TV Verified Successfully',
    data: { customer_name: MOCK_CUSTOMERS[digitSum % MOCK_CUSTOMERS.length], ...plan },
  });
}

// POST /fheerr/verification  (BVN / NIN)
async function verification(req, res) {
  const missing = missingFields(req.body, ['verification_number', 'verification_type']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { verification_number, verification_type } = req.body;
  const type = String(verification_type).toLowerCase();
  if (!['bvn', 'nin'].includes(type)) return fail(res, 'verification_type must be bvn or nin');

  const number = String(verification_number).replace(/\*/g, '');
  if (!isDigits(number, 11, 11)) return fail(res, `${type.toUpperCase()} must be 11 digits`);
  if (!MOCK_EXTERNAL()) return fail(res, 'Verification service unavailable', 503);

  const data = type === 'bvn' ? { bvn: number, bvn_status_id: 2 } : { nin: number };
  await prisma.user.update({ where: { id: req.user.id }, data });

  return ok(res, {
    message: `${type.toUpperCase()} verified successfully`,
    data: {
      verification_type: type,
      verification_number: number.slice(0, 5) + '******',
      first_name: req.user.first_name.toUpperCase(),
      last_name: req.user.last_name.toUpperCase(),
    },
  });
}

// POST /virtual-account/create  (x-api-key)
async function createVirtualAccount(req, res) {
  const missing = missingFields(req.body, ['settlement_accountno', 'account_name', 'accountno']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { settlement_accountno, account_name, accountno } = req.body;

  const settlement = await prisma.wallet.findUnique({ where: { account_number: String(settlement_accountno) } });
  if (!settlement) return fail(res, 'Settlement account not found', 404);

  const exists = await prisma.virtualAccount.findUnique({ where: { accountno: String(accountno) } });
  if (exists) return fail(res, 'Virtual account already exists');

  await prisma.virtualAccount.create({
    data: {
      accountno: String(accountno),
      account_name: String(account_name),
      settlement_accountno: String(settlement_accountno),
    },
  });
  return ok(res, { message: 'Virtual Account Created Successful' });
}

// POST /transactions/errandpay/check-balance
async function posCheckBalance(req, res) {
  const missing = missingFields(req.body, ['serial_number', 'pin']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const terminal = await prisma.posTerminal.findUnique({
    where: { serial_number: String(req.body.serial_number) },
    include: { user: { include: { wallets: { where: { is_primary: true } } } } },
  });
  if (!terminal) return fail(res, 'Terminal not found', 404);

  const pinValid = await bcrypt.compare(String(req.body.pin), terminal.pin);
  if (!pinValid) return res.status(200).json({ is_pin_valid: false, balance: null, agent_status: terminal.status });

  const wallet = terminal.user.wallets[0];
  return res.status(200).json({
    is_pin_valid: true,
    balance: wallet ? toNairaNumber(wallet.balance) : 0,
    agent_status: terminal.status,
  });
}

// POST /transactions/errandpay/get-customer-details
async function posGetCustomerDetails(req, res) {
  const serial = req.body.SerialNumber || req.body.serial_number;
  if (!serial) return fail(res, 'Missing required fields: SerialNumber');

  const terminal = await prisma.posTerminal.findUnique({
    where: { serial_number: String(serial) },
    include: { user: { include: { wallets: { where: { is_primary: true } } } } },
  });
  if (!terminal) return res.status(404).json({ code: 404, message: 'terminal not found', data: null });

  const u = terminal.user;
  return res.status(200).json({
    code: 200,
    message: 'success',
    data: {
      firstName: u.first_name.toUpperCase(),
      lastName: u.last_name.toUpperCase(),
      bvn: u.bvn ? u.bvn.slice(0, 5) + '******' : '',
      accountNumber: u.wallets[0]?.account_number || u.virtual_account,
      bankName: process.env.OUR_BANK_NAME || 'Assetmatrix MFB',
    },
  });
}

// POST /transactions/errandpay/services-webhook
async function posServicesWebhook(req, res) {
  const { StatusCode, SerialNumber, Amount, Fee, TransactionReference, TransactionType } = req.body;
  if (!SerialNumber || !TransactionReference) {
    return fail(res, 'Missing required fields: SerialNumber, TransactionReference');
  }
  if (String(StatusCode) !== '00') return ok(res, { message: 'Notification received' });

  const terminal = await prisma.posTerminal.findUnique({
    where: { serial_number: String(SerialNumber) },
    include: { user: true },
  });
  if (!terminal) return fail(res, 'Terminal not found', 404);

  // Idempotency by provider reference.
  const existing = await prisma.transaction.findUnique({
    where: { transaction_reference: String(TransactionReference) },
  });
  if (existing) return ok(res, { message: 'POS Debited successfully' });

  const amount = toKobo(Amount);
  const fee = toKobo(Fee || 0) || 0n;
  if (amount === null || amount <= 0n) return fail(res, 'Invalid amount');
  const total = amount + fee;

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findFirst({ where: { user_id: terminal.user_id, is_primary: true } });
    if (!wallet) return { error: 'Agent wallet not found' };

    const debited = await tx.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: total } },
      data: { balance: { decrement: total } },
    });
    if (debited.count === 0) return { error: 'Insufficient balance' };

    const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
    await tx.transaction.create({
      data: {
        transaction_reference: String(TransactionReference),
        user_id: terminal.user_id,
        wallet_id: wallet.id,
        transaction_type_id: 9,
        direction: 'Debit',
        amount,
        charge: fee,
        balance_after: fresh.balance,
        description: `POS ${TransactionType || 'transaction'}`,
        status: 'Successful',
      },
    });
    return { balance: fresh.balance };
  });
  if (result.error) return fail(res, result.error);

  await prisma.notification.create({
    data: {
      user_id: terminal.user_id,
      title: 'POS Debit',
      message: `POS ${TransactionType || 'transaction'} of NGN${toNairaString(amount)} was successful.`,
    },
  }).catch(() => {});

  return ok(res, { message: 'POS Debited successfully' });
}

module.exports = {
  verifySmartCard,
  verification,
  createVirtualAccount,
  posCheckBalance,
  posGetCustomerDetails,
  posServicesWebhook,
};
