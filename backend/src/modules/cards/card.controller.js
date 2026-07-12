const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { ok, fail } = require('../../utils/response');
const { missingFields, isDigits } = require('../../utils/validate');
const gen = require('../../utils/generators');
const { serializeCard } = require('../../utils/serializers');

// Card status: 0 processing | 1 active | 2 blocked | 3 permanently blocked

async function verifyTransactionPin(req, res) {
  const pin = req.body.transaction_pin;
  if (!pin) {
    fail(res, 'Missing required fields: transaction_pin');
    return false;
  }
  if (!(await bcrypt.compare(String(pin), req.user.pin))) {
    fail(res, 'Invalid transaction pin');
    return false;
  }
  return true;
}

// POST /atmcard/card-apply
async function applyForCard(req, res) {
  const missing = missingFields(req.body, ['address', 'phone', 'transaction_pin']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);
  if (!(await verifyTransactionPin(req, res))) return;

  const existing = await prisma.card.findFirst({
    where: { user_id: req.user.id, card_status: { in: [0, 1, 2] } },
  });
  if (existing) return fail(res, 'You already have a card request or an active card');

  const pan = gen.cardNumber();
  await prisma.card.create({
    data: {
      user_id: req.user.id,
      card_number: pan,
      masked_pan: gen.maskPan(pan),
      card_cv: gen.cardCvv(),
      card_expiry: gen.cardExpiry(),
      card_status: 0,
      address: String(req.body.address),
      phone: String(req.body.phone),
      thirdparty_name: req.body.thridparty_name || null,
      thirdparty_phone: req.body.thridparty_phone || null,
      note: req.body.note || null,
    },
  });
  await prisma.notification.create({
    data: { user_id: req.user.id, title: 'Card Request', message: 'Your ATM card request is being processed.' },
  });

  return ok(res, { code: 'C01', message: 'Card request is processing' });
}

// POST /atmcard/card/activate
async function activateCard(req, res) {
  const missing = missingFields(req.body, ['card_pin', 'comfirm_card_pin', 'transaction_pin']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { card_pin, comfirm_card_pin } = req.body;
  if (String(card_pin) !== String(comfirm_card_pin)) return fail(res, 'Card pins do not match', 406, { code: 'C08' });
  if (!isDigits(card_pin, 4, 4)) return fail(res, 'Card pin must be exactly 4 digits', 406, { code: 'C08' });
  if (!(await verifyTransactionPin(req, res))) return;

  const card = await prisma.card.findFirst({ where: { user_id: req.user.id, card_status: 0 } });
  if (!card) return fail(res, 'No card pending activation', 404, { code: 'C07' });

  await prisma.card.update({
    where: { id: card.id },
    data: { card_status: 1, card_pin: await bcrypt.hash(String(card_pin), 10) },
  });

  return ok(res, { code: 'C00', message: 'The card has been activated' });
}

// POST /atmcard/card/block-unblock  (block_status: "1" = block, "0" = unblock)
async function blockUnblockCard(req, res) {
  const missing = missingFields(req.body, ['block_status', 'card_id', 'transaction_pin']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);
  if (!(await verifyTransactionPin(req, res))) return;

  const card = await prisma.card.findFirst({
    where: { id: Number(req.body.card_id), user_id: req.user.id },
  });
  if (!card) return fail(res, 'Card not found', 404, { code: 'C07' });
  if (card.card_status === 3) return fail(res, 'Card is permanently blocked', 406, { code: 'C05' });
  if (card.card_status === 0) return fail(res, 'Card is not yet activated', 406, { code: 'C07' });

  const block = String(req.body.block_status) === '1';
  await prisma.card.update({ where: { id: card.id }, data: { card_status: block ? 2 : 1 } });

  return block
    ? ok(res, { code: 'C03', message: 'Card Blocked Successful' })
    : ok(res, { code: 'C06', message: 'Card Unblocked Successful' });
}

// POST /atmcard/card/change-pin
async function changeCardPin(req, res) {
  const missing = missingFields(req.body, ['card_id', 'current_card_pin', 'new_card_pin']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const { card_id, current_card_pin, new_card_pin } = req.body;
  if (!isDigits(new_card_pin, 4, 4)) return fail(res, 'Card pin must be exactly 4 digits', 406, { code: 'C09' });

  const card = await prisma.card.findFirst({ where: { id: Number(card_id), user_id: req.user.id } });
  if (!card) return fail(res, 'Card not found', 404, { code: 'C07' });
  if (card.card_status !== 1) return fail(res, 'Card is not active', 406, { code: 'C07' });

  if (!card.card_pin || !(await bcrypt.compare(String(current_card_pin), card.card_pin))) {
    return fail(res, 'Failed to modify card pin', 406, { code: 'C09' });
  }

  await prisma.card.update({
    where: { id: card.id },
    data: { card_pin: await bcrypt.hash(String(new_card_pin), 10) },
  });
  return ok(res, { code: 'C00', message: 'Card pin modified successfully' });
}

// POST /atmcard/card/block-permanent
async function blockCardPermanent(req, res) {
  const missing = missingFields(req.body, ['card_id', 'card_pin', 'transaction_pin']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);
  if (!(await verifyTransactionPin(req, res))) return;

  const card = await prisma.card.findFirst({ where: { id: Number(req.body.card_id), user_id: req.user.id } });
  if (!card) return fail(res, 'Card not found', 404, { code: 'C07' });
  if (!card.card_pin || !(await bcrypt.compare(String(req.body.card_pin), card.card_pin))) {
    return fail(res, 'Invalid card pin', 406, { code: 'C09' });
  }

  await prisma.card.update({
    where: { id: card.id },
    data: { card_status: 3, block_reason: req.body.reason || null },
  });
  await prisma.notification.create({
    data: { user_id: req.user.id, title: 'Card Blocked', message: 'Your card has been permanently blocked.' },
  });

  return ok(res, { code: 'C04', message: 'Card blocked permanently' });
}

// GET /atmcard/get-card
async function getCard(req, res) {
  const card = await prisma.card.findFirst({
    where: { user_id: req.user.id, card_status: { not: 3 } },
    orderBy: { created_at: 'desc' },
  });

  // is_card_available: 0 none | 1 processing | 2 available
  if (!card) {
    return ok(res, { message: 'Card details fetched', data: { cards: null, is_card_available: 0 } });
  }
  return ok(res, {
    message: 'Card details fetched',
    data: { cards: serializeCard(card), is_card_available: card.card_status === 0 ? 1 : 2 },
  });
}

module.exports = { applyForCard, activateCard, blockUnblockCard, changeCardPin, blockCardPermanent, getCard };
