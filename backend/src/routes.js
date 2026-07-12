const { Router } = require('express');
const { requireAuth, requireApiKey } = require('./middleware/auth');
const { asyncHandler: ah } = require('./utils/response');

const users = require('./modules/users/user.controller');
const txn = require('./modules/transactions/transaction.controller');
const cards = require('./modules/cards/card.controller');
const loans = require('./modules/loans/loan.controller');
const misc = require('./modules/misc/misc.controller');

const router = Router();

// ---- Users / auth ----
router.post('/users/register', ah(users.register));
router.post('/users/login', ah(users.login));
router.get('/users/get-details', requireAuth, ah(users.getDetails));
router.get('/users/customer/get-balance', requireAuth, ah(users.getBalance));
router.post('/users/change-password', requireAuth, ah(users.changePassword));
router.post('/users/verify-pin', requireAuth, ah(users.verifyPin));
router.get('/users/markasreadnotification', requireAuth, ah(users.markNotificationRead));
router.post('/users/save-beneficiary', requireAuth, ah(users.saveBeneficiary));
router.get('/users/delete-beneficiary', requireAuth, ah(users.deleteBeneficiary));

// ---- Banks / verification ----
router.get('/get-banks', ah(txn.getBanks));
router.post('/verify-bank-account', requireAuth, ah(txn.verifyBankAccount));
router.post('/fheerr/verification', requireAuth, ah(misc.verification));

// ---- Transactions ----
router.post('/transactions/initiate-transaction', requireAuth, ah(txn.initiateTransaction));
router.post('/transactions/bnk/bank-transfer', requireAuth, ah(txn.bankTransfer));
router.get('/transactions/get-statement', requireAuth, ah(txn.getStatement));
router.post('/transactions/get-statement', requireAuth, ah(txn.getStatement));
router.get('/transactions/get-beneficiary', requireAuth, ah(txn.getBeneficiaries));
router.get('/query-transaction/settlement', ah(txn.queryTransaction));
router.get('/account/get-deposit-transactions', requireAuth, ah(txn.getDepositTransactions));
router.post('/account/get-deposit-transactions', requireAuth, ah(txn.getDepositTransactions));

// ---- Server-to-server (x-api-key) ----
router.post('/banktransfer-payout', requireApiKey, ah(txn.payout));
router.post('/virtual-account/create', requireApiKey, ah(misc.createVirtualAccount));

// ---- Cable TV ----
router.post('/transactions/verify-smart-card', requireAuth, ah(misc.verifySmartCard));

// ---- ATM cards ----
router.post('/atmcard/card-apply', requireAuth, ah(cards.applyForCard));
router.post('/atmcard/card/activate', requireAuth, ah(cards.activateCard));
router.post('/atmcard/card/block-unblock', requireAuth, ah(cards.blockUnblockCard));
router.post('/atmcard/card/change-pin', requireAuth, ah(cards.changeCardPin));
router.post('/atmcard/card/block-permanent', requireAuth, ah(cards.blockCardPermanent));
router.get('/atmcard/get-card', requireAuth, ah(cards.getCard));

// ---- Loans ----
router.get('/loan/get-all-loans', requireAuth, ah(loans.getAllLoans));
router.post('/loan/get-loan', requireAuth, ah(loans.getLoan));
router.post('/loan/check-eligibility', requireAuth, ah(loans.checkEligibility));
router.post('/loan/store-loan', requireAuth, ah(loans.applyLoan));
router.get('/loan/get-active-loan', requireAuth, ah(loans.getActiveLoan));

// ---- POS (ErrandPay) ----
router.post('/transactions/errandpay/check-balance', ah(misc.posCheckBalance));
router.post('/transactions/errandpay/get-customer-details', ah(misc.posGetCustomerDetails));
router.post('/transactions/errandpay/services-webhook', ah(misc.posServicesWebhook));

module.exports = router;
