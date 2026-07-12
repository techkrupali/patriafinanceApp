const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { ok, fail } = require('../../utils/response');
const { missingFields, isDigits, isEmail } = require('../../utils/validate');
const gen = require('../../utils/generators');
const { toNairaString } = require('../../utils/money');
const { serializeUser } = require('../../utils/serializers');
const { signToken } = require('../../middleware/auth');

async function uniqueAccountNumber() {
  for (;;) {
    const acc = gen.accountNumber();
    const exists = await prisma.wallet.findUnique({ where: { account_number: acc } });
    if (!exists) return acc;
  }
}

async function loadUserBundle(userId) {
  const [wallets, cards, sliders] = await Promise.all([
    prisma.wallet.findMany({ where: { user_id: userId } }),
    prisma.card.findMany({ where: { user_id: userId, card_status: { not: 3 } } }),
    prisma.slider.findMany({ where: { status_id: 1 } }),
  ]);
  return { wallets, cards, sliders };
}

// POST /users/register
async function register(req, res) {
  const required = ['first_name', 'last_name', 'phone', 'email', 'username', 'pin', 'password'];
  const missing = missingFields(req.body, required);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { first_name, last_name, phone, email, username, pin, company, password, device_id } = req.body;

  if (!isDigits(phone, 10, 15)) return fail(res, 'invalid verified phone number');
  if (!isEmail(email)) return fail(res, 'Invalid email address');
  if (!isDigits(pin, 4, 4)) return fail(res, 'Pin must be exactly 4 digits');
  if (String(password).length < 8) return fail(res, 'Password must be at least 8 characters');

  const clash = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }, { username }] },
  });
  if (clash) {
    if (clash.phone === phone) return fail(res, 'Phone number already registered');
    if (clash.email === email) return fail(res, 'Email already registered');
    return fail(res, 'Username already taken');
  }

  const accountNo = await uniqueAccountNumber();
  const user = await prisma.user.create({
    data: {
      first_name,
      last_name,
      phone,
      email,
      username,
      company: company || null,
      device_id: device_id || null,
      password: await bcrypt.hash(String(password), 10),
      pin: await bcrypt.hash(String(pin), 10),
      virtual_account: accountNo,
      account_reference: gen.accountReference(),
      api_key: gen.apiKey(),
      wallets: { create: { account_number: accountNo, is_primary: true, balance: 0n } },
      notifications: {
        create: {
          title: 'Welcome',
          message: `Welcome ${first_name}! Your account ${accountNo} has been created successfully.`,
        },
      },
    },
  });

  const bundle = await loadUserBundle(user.id);
  return ok(res, {
    message: 'Account created successfully',
    data: { user: serializeUser(user, bundle), token: signToken(user) },
  });
}

// POST /users/login
async function login(req, res) {
  const missing = missingFields(req.body, ['username', 'password']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { username, password, device_id } = req.body;
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: String(username) }, { email: String(username) }] },
  });
  if (!user || !(await bcrypt.compare(String(password), user.password))) {
    return fail(res, 'Invalid username or password', 401);
  }
  if (user.status_id !== 1) return fail(res, 'Account is inactive, contact support', 401);

  if (device_id && device_id !== user.device_id) {
    await prisma.user.update({ where: { id: user.id }, data: { device_id } });
  }

  const bundle = await loadUserBundle(user.id);
  return ok(res, {
    message: 'Login Successful',
    data: { user: serializeUser(user, bundle), token: signToken(user) },
  });
}

// GET /users/get-details
async function getDetails(req, res) {
  const user = req.user;
  const bundle = await loadUserBundle(user.id);

  const sums = await prisma.transaction.groupBy({
    by: ['direction'],
    where: { user_id: user.id, status: 'Successful' },
    _sum: { amount: true },
  });
  const credit = sums.find((s) => s.direction === 'Credit')?._sum.amount || 0n;
  const debit = sums.find((s) => s.direction === 'Debit')?._sum.amount || 0n;

  const notifications = await prisma.notification.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  return ok(res, {
    message: 'User Details Fetched successfully',
    data: serializeUser(user, {
      ...bundle,
      extras: {
        api_key: user.api_key,
        totalcredit: toNairaString(credit),
        totaldebit: toNairaString(debit),
        notifications: notifications.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          is_read: n.is_read ? 1 : 0,
          date: n.created_at,
        })),
      },
    }),
  });
}

// GET /users/customer/get-balance
async function getBalance(req, res) {
  const wallets = await prisma.wallet.findMany({ where: { user_id: req.user.id } });
  return ok(res, {
    data: wallets.map((w) => ({
      id: req.user.id,
      name: `${req.user.first_name} ${req.user.last_name}`,
      account_number: w.account_number,
      balance: toNairaString(w.balance),
      combalance: toNairaString(req.user.combalance),
    })),
  });
}

// POST /users/change-password
async function changePassword(req, res) {
  const missing = missingFields(req.body, ['current_password', 'new_password']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { current_password, new_password } = req.body;
  if (!(await bcrypt.compare(String(current_password), req.user.password))) {
    return fail(res, 'Current password is incorrect');
  }
  if (String(new_password).length < 8) return fail(res, 'Password must be at least 8 characters');

  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: await bcrypt.hash(String(new_password), 10) },
  });
  return ok(res, { message: 'Password changed successfully' });
}

// POST /users/verify-pin
async function verifyPin(req, res) {
  const missing = missingFields(req.body, ['pin']);
  if (missing.length) return fail(res, 'Missing required fields: pin');

  if (!(await bcrypt.compare(String(req.body.pin), req.user.pin))) {
    return fail(res, 'Invalid pin');
  }
  return ok(res, { message: 'Pin verified' });
}

// GET /users/markasreadnotification?uid=4
async function markNotificationRead(req, res) {
  const uid = Number(req.query.uid);
  if (!uid) {
    await prisma.notification.updateMany({
      where: { user_id: req.user.id, is_read: false },
      data: { is_read: true },
    });
    return ok(res, { message: 'All notifications marked as read' });
  }
  const result = await prisma.notification.updateMany({
    where: { id: uid, user_id: req.user.id },
    data: { is_read: true },
  });
  if (result.count === 0) return fail(res, 'Notification not found', 404);
  return ok(res, { message: 'Notification marked as read' });
}

// POST /users/save-beneficiary
async function saveBeneficiary(req, res) {
  const missing = missingFields(req.body, ['account_name', 'type']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { account_name, account_number, bank_name, bank_code, provider, network, biller_number, type } = req.body;

  const existing = await prisma.beneficiary.findFirst({
    where: {
      user_id: req.user.id,
      type: String(type),
      account_number: account_number ? String(account_number) : null,
      biller_number: biller_number ? String(biller_number) : null,
    },
  });
  if (existing) return ok(res, { message: 'Beneficiary already saved' });

  await prisma.beneficiary.create({
    data: {
      user_id: req.user.id,
      account_name: String(account_name),
      account_number: account_number ? String(account_number) : null,
      bank_name: bank_name ? String(bank_name) : null,
      bank_code: bank_code ? String(bank_code) : null,
      provider: provider ? String(provider) : null,
      network: network ? String(network) : null,
      biller_number: biller_number ? String(biller_number) : null,
      type: String(type),
    },
  });
  return ok(res, { message: 'Beneficiary saved successfully' });
}

// GET /users/delete-beneficiary?id=2
async function deleteBeneficiary(req, res) {
  const id = Number(String(req.query.id || '').replace(/"/g, ''));
  if (!id) return fail(res, 'Beneficiary id is required');

  const result = await prisma.beneficiary.deleteMany({ where: { id, user_id: req.user.id } });
  if (result.count === 0) return fail(res, 'Beneficiary not found', 404);
  return ok(res, { message: 'Beneficiary deleted successfully' });
}

module.exports = {
  register,
  login,
  getDetails,
  getBalance,
  changePassword,
  verifyPin,
  markNotificationRead,
  saveBeneficiary,
  deleteBeneficiary,
};
