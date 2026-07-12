const { toNairaString } = require('./money');

const OUR_BANK_NAME = process.env.OUR_BANK_NAME || 'Assetmatrix MFB';

function serializeWallet(w) {
  return {
    account_id: w.id,
    account_number: w.account_number,
    bank_id: w.bank_id,
    bank: OUR_BANK_NAME,
    product_name: w.product_name,
    wallet_balance: toNairaString(w.balance),
  };
}

function serializeCard(c) {
  return {
    card_id: c.id,
    card_number: c.card_number,
    masked_pan: c.masked_pan,
    card_cv: c.card_cv,
    card_expiry: c.card_expiry,
    card_status: c.card_status,
  };
}

/**
 * Shape used by login / get-details (mirrors the upstream API contract).
 * `extras` may add totalcredit/totaldebit/api_key etc.
 */
function serializeUser(user, { wallets = [], cards = [], sliders = [], extras = {} } = {}) {
  const primary = wallets.find((w) => w.is_primary) || wallets[0];
  return {
    userid: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    business_name: user.business_name,
    phone: user.phone,
    profile_pic: user.profile_pic,
    username: user.username,
    bvn: user.bvn ? user.bvn.slice(0, 5) + '******' : null,
    bvn_status_id: user.bvn_status_id,
    nin: user.nin ? user.nin.slice(0, 5) + '******' : null,
    dob: user.dob,
    email: user.email,
    address: user.address,
    sex: user.sex,
    virtual_account: user.virtual_account,
    account_reference: user.account_reference,
    bank_id: String(user.bank_id),
    company_id: String(user.company_id),
    status_id: String(user.status_id),
    user_type_id: String(user.user_type_id),
    phone_verification_status_id: String(user.phone_verification_status_id),
    account_officer_id: String(user.account_officer_id),
    branch_id: user.branch_id,
    balance: primary ? toNairaString(primary.balance) : '0.00',
    combalance: toNairaString(user.combalance),
    wallets: wallets.map(serializeWallet),
    cards: cards.map(serializeCard),
    sliders,
    ...extras,
  };
}

module.exports = { serializeUser, serializeWallet, serializeCard };
