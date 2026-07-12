const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { ok, fail } = require('../../utils/response');
const { missingFields, isDigits } = require('../../utils/validate');
const gen = require('../../utils/generators');
const { toKobo, toNairaString, toNairaNumber } = require('../../utils/money');
const { parseDMY, formatStatementDate, formatQueryDate } = require('../../utils/dates');
const { sendDepositWebhook } = require('../../utils/webhook');

const OUR_BANK_CODE = () => process.env.OUR_BANK_CODE || '090287';
const MOCK_EXTERNAL = () => String(process.env.MOCK_EXTERNAL_PROVIDERS || 'true') === 'true';

// Deterministic mock names for external account verification (dev mode).
const MOCK_NAMES = [
  ['ADEYEMI', 'JOHNSON'], ['CHINEDU', 'OKORO'], ['FATIMA', 'ABUBAKAR'],
  ['EMEKA', 'EZE'], ['AISHA', 'BELLO'], ['OLUWASEUN', 'ADEBAYO'],
  ['NGOZI', 'NWOSU'], ['IBRAHIM', 'MUSA'], ['CHIAMAKA', 'OBI'], ['TUNDE', 'BAKARE'],
];
function mockNameFor(accountNumber) {
  const digitSum = String(accountNumber).split('').reduce((a, c) => a + (Number(c) || 0), 0);
  return MOCK_NAMES[digitSum % MOCK_NAMES.length];
}

async function getChargeFor(typeId) {
  const t = await prisma.transactionType.findUnique({ where: { id: Number(typeId) || 8 } });
  return t ? t.charge : 0n;
}

// GET /get-banks
async function getBanks(req, res) {
  const banks = await prisma.bank.findMany({ orderBy: { bank_name: 'asc' } });
  return ok(res, {
    message: 'Banks fetched successfully',
    data: banks.map((b) => ({
      id: b.id,
      bank_name: b.bank_name,
      bank_code: b.bank_code,
      short_code: b.short_code,
      created_at: null,
      updated_at: null,
    })),
  });
}

// POST /verify-bank-account
async function verifyBankAccount(req, res) {
  const missing = missingFields(req.body, ['account_number', 'bank_code']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { account_number, bank_code } = req.body;
  if (!isDigits(account_number, 10, 10)) return fail(res, 'Account number must be 10 digits');

  const bank = await prisma.bank.findUnique({ where: { bank_code: String(bank_code) } });
  if (!bank) return fail(res, 'Unknown bank code');

  // Internal account: look up the real owner.
  if (String(bank_code) === OUR_BANK_CODE()) {
    const wallet = await prisma.wallet.findUnique({
      where: { account_number: String(account_number) },
      include: { user: true },
    });
    if (!wallet) return fail(res, 'Account could not be verified', 404);
    return ok(res, {
      message: 'Account Verified Successfully',
      data: {
        first_name: wallet.user.first_name.toUpperCase(),
        last_name: wallet.user.last_name.toUpperCase(),
        bank_name: bank.bank_name,
      },
    });
  }

  // External account: deterministic mock in dev; real NIP lookup goes here in production.
  if (!MOCK_EXTERNAL()) return fail(res, 'External account verification unavailable', 503);
  const [first, last] = mockNameFor(account_number);
  return ok(res, {
    message: 'Account Verified Successfully',
    data: { first_name: first, last_name: last, bank_name: bank.bank_name },
  });
}

// POST /transactions/initiate-transaction
async function initiateTransaction(req, res) {
  const missing = missingFields(req.body, ['final_amount', 'transaction_type', 'destination_account']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const amount = toKobo(req.body.final_amount);
  if (amount === null || amount <= 0n) return fail(res, 'Invalid amount');

  const typeId = Number(req.body.transaction_type) || 8;
  const charge = await getChargeFor(typeId);
  const total = amount + charge;

  const wallet = await prisma.wallet.findFirst({ where: { user_id: req.user.id, is_primary: true } });
  if (!wallet || wallet.balance < total) return fail(res, 'Insufficient balance');

  const reference = gen.transactionReference();
  await prisma.transaction.create({
    data: {
      transaction_reference: reference,
      user_id: req.user.id,
      wallet_id: wallet.id,
      transaction_type_id: typeId,
      direction: 'Debit',
      amount,
      charge,
      description: req.body.description || null,
      destination_account: String(req.body.destination_account),
      status: 'Initiated',
    },
  });

  return ok(res, {
    message: 'Transaction initialized',
    data: {
      charge: toNairaString(charge),
      transaction_reference: reference,
      transactionTypeId: String(typeId),
      transfer_amount: toNairaString(amount),
      total: toNairaNumber(total),
    },
  });
}

/**
 * Core transfer engine shared by bank-transfer and payout.
 * Debits sender atomically; credits destination when it is an internal wallet.
 */
async function executeTransfer({ user, amount, charge, reference, destinationAccount, bankCode, bankName, recipientName, description, typeId = 8 }) {
  const total = amount + charge;

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findFirst({ where: { user_id: user.id, is_primary: true } });
    if (!wallet) return { error: 'Wallet not found' };

    // Conditional decrement: guards against races/overdraft.
    const debited = await tx.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: total } },
      data: { balance: { decrement: total } },
    });
    if (debited.count === 0) return { error: 'Insufficient balance' };

    const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });

    await tx.transaction.upsert({
      where: { transaction_reference: reference },
      create: {
        transaction_reference: reference,
        user_id: user.id,
        wallet_id: wallet.id,
        transaction_type_id: typeId,
        direction: 'Debit',
        amount,
        charge,
        balance_after: fresh.balance,
        description,
        destination_account: destinationAccount,
        destination_bank_code: bankCode,
        destination_bank_name: bankName,
        recipient_name: recipientName,
        source_account: wallet.account_number,
        source_name: `${user.first_name} ${user.last_name}`,
        status: 'Successful',
        session_id: gen.sessionId(),
      },
      update: {
        status: 'Successful',
        balance_after: fresh.balance,
        recipient_name: recipientName,
        charge,
        description,
        destination_bank_code: bankCode,
        destination_bank_name: bankName,
        source_account: wallet.account_number,
        source_name: `${user.first_name} ${user.last_name}`,
      },
    });

    // Internal destination -> credit the receiving wallet in the same transaction.
    // A virtual account resolves to its settlement wallet (deposits are then
    // reported to the company webhook under the virtual account number).
    let credited = null;
    let creditedVa = null;
    if (String(bankCode) === OUR_BANK_CODE()) {
      creditedVa = await tx.virtualAccount.findUnique({
        where: { accountno: String(destinationAccount) },
      });
      const targetAccount = creditedVa ? creditedVa.settlement_accountno : String(destinationAccount);
      const destWallet = await tx.wallet.findUnique({
        where: { account_number: targetAccount },
        include: { user: true },
      });
      if (!destWallet) return { error: 'Destination account not found' };

      const updated = await tx.wallet.update({
        where: { id: destWallet.id },
        data: { balance: { increment: amount } },
      });
      await tx.transaction.create({
        data: {
          transaction_reference: gen.transactionReference(),
          user_id: destWallet.user_id,
          wallet_id: destWallet.id,
          transaction_type_id: typeId,
          direction: 'Credit',
          amount,
          balance_after: updated.balance,
          description: description || `Transfer from ${user.first_name} ${user.last_name}`,
          source_account: wallet.account_number,
          source_name: `${user.first_name} ${user.last_name}`,
          status: 'Successful',
          session_id: gen.sessionId(),
        },
      });
      credited = destWallet;
    }

    return { wallet: fresh, credited, creditedVa };
  });

  if (result.error) return result;

  // Post-commit side effects (notifications, webhook) — non-critical.
  const { wallet, credited, creditedVa } = result;
  await prisma.notification.create({
    data: {
      user_id: user.id,
      title: 'Debit Alert',
      message: `NGN${toNairaString(amount)} transfer to ${recipientName || destinationAccount} (${bankName || 'bank'}). Balance: NGN${toNairaString(wallet.balance)}`,
    },
  }).catch(() => {});

  if (credited) {
    await prisma.notification.create({
      data: {
        user_id: credited.user_id,
        title: 'Credit Alert',
        message: `NGN${toNairaString(amount)} received from ${user.first_name} ${user.last_name}.`,
      },
    }).catch(() => {});

    sendDepositWebhook({
      accountName: creditedVa ? creditedVa.account_name : `${credited.user.first_name} ${credited.user.last_name}`,
      accountNumber: creditedVa ? creditedVa.accountno : credited.account_number,
      amount: toNairaNumber(amount),
      tranxfee: toNairaNumber(charge),
      narration: description || 'Transfer',
      sessionId: gen.sessionId(),
      sourceAccountNumber: wallet.account_number,
      sourceAccountName: `${user.first_name} ${user.last_name}`,
    });
  }

  return result;
}

// POST /transactions/bnk/bank-transfer
async function bankTransfer(req, res) {
  const missing = missingFields(req.body, ['destination_account', 'bank_code', 'final_amount', 'transaction_pin']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { destination_account, bank_code, bank_name, receipient_name, beneficiary, transaction_reference, final_amount, transaction_pin, description } = req.body;

  if (!(await bcrypt.compare(String(transaction_pin), req.user.pin))) {
    return fail(res, 'Invalid transaction pin');
  }

  const amount = toKobo(final_amount);
  if (amount === null || amount <= 0n) return fail(res, 'Invalid amount');

  const bank = await prisma.bank.findUnique({ where: { bank_code: String(bank_code) } });
  if (!bank) return fail(res, 'Unknown bank code');

  // Reuse the initiated reference when provided (idempotency).
  let reference = transaction_reference ? String(transaction_reference) : gen.transactionReference();
  const existing = await prisma.transaction.findUnique({ where: { transaction_reference: reference } });
  if (existing) {
    if (existing.user_id !== req.user.id) return fail(res, 'Invalid transaction reference');
    if (existing.status === 'Successful') {
      const w = await prisma.wallet.findFirst({ where: { user_id: req.user.id, is_primary: true } });
      return ok(res, {
        statuscode: '00',
        message: 'Bank Transfer Successful',
        data: { balance: toNairaNumber(w.balance) },
      });
    }
  }

  const charge = existing ? existing.charge : await getChargeFor(8);
  const result = await executeTransfer({
    user: req.user,
    amount,
    charge,
    reference,
    destinationAccount: String(destination_account),
    bankCode: String(bank_code),
    bankName: bank.bank_name,
    recipientName: receipient_name || null,
    description: description || null,
  });
  if (result.error) return fail(res, result.error);

  if (String(beneficiary) === 'true') {
    const dup = await prisma.beneficiary.findFirst({
      where: { user_id: req.user.id, account_number: String(destination_account), type: 'BankTransfer' },
    });
    if (!dup) {
      await prisma.beneficiary.create({
        data: {
          user_id: req.user.id,
          account_name: receipient_name || 'Unknown',
          account_number: String(destination_account),
          bank_name: bank_name || bank.bank_name,
          bank_code: String(bank_code),
          type: 'BankTransfer',
        },
      });
    }
  }

  return ok(res, {
    statuscode: '00',
    message: 'Bank Transfer Successful',
    data: { balance: toNairaNumber(result.wallet.balance) },
  });
}

// POST /banktransfer-payout  (server-to-server, x-api-key)
async function payout(req, res) {
  const missing = missingFields(req.body, ['amount', 'destination_account', 'bank_code', 'username', 'payment_reference']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { amount: rawAmount, destination_account, bank_code, username, payment_reference, description } = req.body;

  if (req.apiUser.username !== String(username)) {
    return fail(res, 'API key does not match the supplied username', 401);
  }

  const amount = toKobo(rawAmount);
  if (amount === null || amount <= 0n) return fail(res, 'Invalid amount');

  const bank = await prisma.bank.findUnique({ where: { bank_code: String(bank_code) } });
  if (!bank) return fail(res, 'Unknown bank code');

  // Idempotency by payment_reference.
  const reference = String(payment_reference);
  const existing = await prisma.transaction.findUnique({ where: { transaction_reference: reference } });
  if (existing && existing.status === 'Successful') {
    const w = await prisma.wallet.findFirst({ where: { user_id: req.apiUser.id, is_primary: true } });
    return ok(res, {
      statuscode: '00',
      message: 'Bank Transfer Successful',
      data: { balance: toNairaNumber(w.balance) },
    });
  }

  const result = await executeTransfer({
    user: req.apiUser,
    amount,
    charge: await getChargeFor(8),
    reference,
    destinationAccount: String(destination_account),
    bankCode: String(bank_code),
    bankName: bank.bank_name,
    recipientName: null,
    description: description || 'Payout',
  });
  if (result.error) return fail(res, result.error);

  return ok(res, {
    statuscode: '00',
    message: 'Bank Transfer Successful',
    data: { balance: toNairaNumber(result.wallet.balance) },
  });
}

// GET /transactions/get-statement
async function getStatement(req, res) {
  const params = { ...req.query, ...req.body };
  const from = parseDMY(params.datefrom);
  const to = parseDMY(params.dateto);

  const where = { user_id: req.user.id, status: { in: ['Successful', 'Failed'] } };
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at.gte = from;
    if (to) {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      where.created_at.lt = end;
    }
  }

  const txns = await prisma.transaction.findMany({ where, orderBy: { created_at: 'desc' }, take: 500 });
  return ok(res, {
    message: 'Transactions fetched successfully',
    data: txns.map((t) => ({
      transaction_id: t.transaction_reference,
      amount: toNairaNumber(t.amount),
      charge: toNairaNumber(t.charge),
      narration: t.description || '',
      date: formatStatementDate(t.created_at),
      type: t.direction,
      status: t.status,
      destination_account: t.destination_account,
      destination_bank: t.destination_bank_name,
      recipient_name: t.recipient_name,
      source_account: t.source_account,
      source_name: t.source_name,
      balance_after: t.balance_after !== null ? toNairaString(t.balance_after) : null,
    })),
  });
}

// GET /transactions/get-beneficiary?userid=246
async function getBeneficiaries(req, res) {
  const list = await prisma.beneficiary.findMany({
    where: { user_id: req.user.id },
    orderBy: { created_at: 'desc' },
  });
  const shape = (b) => ({
    id: b.id,
    account_name: b.account_name,
    account_number: b.account_number,
    bank_name: b.bank_name,
    bank_code: b.bank_code,
    provider: b.provider,
    network: b.network,
    biller_number: b.biller_number,
    type: b.type,
  });
  return ok(res, {
    bankdata: list.filter((b) => b.type === 'BankTransfer').map(shape),
    walletdata: list.filter((b) => b.type === 'WalletTransfer').map(shape),
    billdata: list.filter((b) => !['BankTransfer', 'WalletTransfer'].includes(b.type)).map(shape),
  });
}

// GET /query-transaction/settlement?ref=...
async function queryTransaction(req, res) {
  const ref = String(req.query.ref || '').trim();
  if (!ref) return fail(res, 'Transaction reference is required');

  const t = await prisma.transaction.findUnique({ where: { transaction_reference: ref } });
  if (!t) return fail(res, 'Transaction not found', 404);

  return ok(res, {
    message: 'Transaction details fetched successfully',
    data: {
      amount: toNairaString(t.amount),
      transaction_reference: t.transaction_reference,
      transaction_remark: t.status === 'Successful' ? 'success' : t.status.toLowerCase(),
      description: t.description || '',
      transaction_date: formatQueryDate(t.created_at),
    },
  });
}

// GET /account/get-deposit-transactions
async function getDepositTransactions(req, res) {
  const params = { ...req.query, ...req.body };
  const where = { user_id: req.user.id, direction: 'Credit', status: 'Successful' };

  if (params.accountNumber) {
    const wallet = await prisma.wallet.findUnique({ where: { account_number: String(params.accountNumber) } });
    if (!wallet || wallet.user_id !== req.user.id) return fail(res, 'Account not found', 404);
    where.wallet_id = wallet.id;
  }

  const txns = await prisma.transaction.findMany({ where, orderBy: { created_at: 'desc' }, take: 200 });
  return ok(res, {
    data: txns.map((t) => ({
      transaction_id: t.transaction_reference,
      amount: toNairaNumber(t.amount),
      narration: t.description || '',
      date: formatStatementDate(t.created_at),
      type: 'Credit',
      status: t.status,
    })),
  });
}

module.exports = {
  getBanks,
  verifyBankAccount,
  initiateTransaction,
  bankTransfer,
  payout,
  getStatement,
  getBeneficiaries,
  queryTransaction,
  getDepositTransactions,
};
