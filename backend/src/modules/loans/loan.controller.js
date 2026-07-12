const prisma = require('../../config/db');
const { ok, fail } = require('../../utils/response');
const { missingFields } = require('../../utils/validate');
const gen = require('../../utils/generators');
const { toKobo, toNairaString, formatNaira, pct } = require('../../utils/money');
const { formatDMY } = require('../../utils/dates');

const INTEREST_RATE_PER_MONTH = 4; // percent
const ELIGIBLE_FRACTION = 0.4; // 40% of 90-day credit turnover

/** Max loan (kobo) = 40% of successful credits in the last 90 days, minus outstanding active principal. */
async function maxEligible(userId) {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const credits = await prisma.transaction.aggregate({
    where: { user_id: userId, direction: 'Credit', status: 'Successful', created_at: { gte: since } },
    _sum: { amount: true },
  });
  const turnover = credits._sum.amount || 0n;
  let max = pct(turnover, ELIGIBLE_FRACTION * 100);

  const active = await prisma.loan.findFirst({ where: { user_id: userId, status: { in: ['active', 'pending'] } } });
  if (active) max = 0n; // one loan at a time

  return max;
}

// POST /loan/check-eligibility
async function checkEligibility(req, res) {
  const missing = missingFields(req.body, ['principal']);
  if (missing.length) return fail(res, 'Missing required fields: principal');

  const principal = toKobo(req.body.principal);
  if (principal === null || principal <= 0n) return fail(res, 'Invalid principal amount');

  const max = await maxEligible(req.user.id);
  if (max <= 0n) return fail(res, 'sorry you are not eligible');
  if (principal > max) {
    return fail(res, `Sorry, you are only eligible to apply for loan up to ${formatNaira(max)}`);
  }
  return ok(res, { message: 'account eligible' });
}

// POST /loan/store-loan
async function applyLoan(req, res) {
  const missing = missingFields(req.body, ['principal', 'duration']);
  if (missing.length) return fail(res, `Missing required fields: ${missing.join(', ')}`);

  const principal = toKobo(req.body.principal);
  const duration = Number(req.body.duration);
  if (principal === null || principal <= 0n) return fail(res, 'Invalid principal amount');
  if (!Number.isInteger(duration) || duration < 1 || duration > 24) {
    return fail(res, 'Duration must be between 1 and 24 months');
  }

  const max = await maxEligible(req.user.id);
  if (max <= 0n) return fail(res, 'sorry you are not eligible');
  if (principal > max) {
    return fail(res, `Sorry, you are only eligible to apply for loan up to ${formatNaira(max)}`);
  }

  const interest = pct(principal, INTEREST_RATE_PER_MONTH) * BigInt(duration);
  const dueDate = new Date();
  dueDate.setMonth(dueDate.getMonth() + duration);

  await prisma.loan.create({
    data: {
      user_id: req.user.id,
      loan_code: gen.loanCode(),
      principal,
      interest,
      duration_months: duration,
      due_date: dueDate,
      status: 'pending',
    },
  });
  await prisma.notification.create({
    data: {
      user_id: req.user.id,
      title: 'Loan Application',
      message: `Your loan application of NGN${toNairaString(principal)} is awaiting approval.`,
    },
  });

  return ok(res, { message: 'Loan appiled and waiting approval' });
}

// GET /loan/get-all-Loans
async function getAllLoans(req, res) {
  const loans = await prisma.loan.findMany({ where: { user_id: req.user.id }, orderBy: { created_at: 'desc' } });
  return ok(res, {
    message: 'Loan Fetched',
    data: loans.map((l) => ({
      loan_id: l.id,
      loan_code: l.loan_code,
      principal: toNairaString(l.principal),
      status: l.status,
    })),
  });
}

// POST /loan/get-loan
async function getLoan(req, res) {
  const missing = missingFields(req.body, ['loan_id']);
  if (missing.length) return fail(res, 'Missing required fields: loan_id');

  const loan = await prisma.loan.findFirst({
    where: { id: Number(req.body.loan_id), user_id: req.user.id },
  });
  if (!loan) return fail(res, 'Loan not found', 404);

  const totalDue = loan.principal + loan.interest + loan.fees;
  const pendingDue = totalDue > loan.total_paid ? totalDue - loan.total_paid : 0n;
  const principalBalance = loan.status === 'paid' ? 0n : loan.principal;

  return ok(res, {
    message: 'Loan data Fetched',
    data: [
      {
        due_date: loan.due_date ? formatDMY(loan.due_date) : null,
        principal: toNairaString(loan.principal),
        interest: toNairaString(loan.interest),
        fees: toNairaString(loan.fees),
        total_paid: toNairaString(loan.total_paid),
        'pending due': toNairaString(pendingDue),
        principal_balance: toNairaString(principalBalance),
        loan_paid_status: loan.status === 'paid' ? 'paid' : 'unpaid',
      },
    ],
  });
}

// GET /loan/get-active-loan
async function getActiveLoan(req, res) {
  const loan = await prisma.loan.findFirst({
    where: { user_id: req.user.id, status: { in: ['active', 'pending'] } },
    orderBy: { created_at: 'desc' },
  });
  if (!loan) return fail(res, 'No Loan found', 406, { data: [] });

  return ok(res, {
    message: 'Active loan fetched',
    data: [
      {
        loan_id: loan.id,
        loan_code: loan.loan_code,
        principal: toNairaString(loan.principal),
        interest: toNairaString(loan.interest),
        duration: loan.duration_months,
        due_date: loan.due_date ? formatDMY(loan.due_date) : null,
        status: loan.status,
      },
    ],
  });
}

module.exports = { checkEligibility, applyLoan, getAllLoans, getLoan, getActiveLoan };
