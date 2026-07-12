require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const OUR_BANK_NAME = process.env.OUR_BANK_NAME || 'Assetmatrix MFB';
const OUR_BANK_CODE = process.env.OUR_BANK_CODE || '090287';

const BANKS = [
  [OUR_BANK_NAME, OUR_BANK_CODE, ''],
  ['3Line', '110005', ''],
  ['Ab MFB', '090270', ''],
  ['Abbey Mortgage Bank', '070010', ''],
  ['Above Only MFB', '090260', ''],
  ['Access Bank Nigeria', '000014', '044'],
  ['Accion MFB', '090134', ''],
  ['Citibank', '000009', '023'],
  ['Ecobank Nigeria', '000010', '050'],
  ['FCMB', '000003', '214'],
  ['Fidelity Bank', '000007', '070'],
  ['First Bank of Nigeria', '000016', '011'],
  ['Globus Bank', '000027', ''],
  ['GTBank', '000013', '058'],
  ['Heritage Bank', '000020', '030'],
  ['Jaiz Bank', '000006', '301'],
  ['Keystone Bank', '000002', '082'],
  ['Kuda Microfinance Bank', '090267', ''],
  ['Lotus Bank', '000029', ''],
  ['Moniepoint MFB', '090405', ''],
  ['Opay Digital Services', '100004', ''],
  ['Optimus Bank', '000036', ''],
  ['Palmpay', '100033', ''],
  ['Parallex Bank', '000030', ''],
  ['Polaris Bank', '000008', '076'],
  ['Premium Trust Bank', '000031', ''],
  ['Providus Bank', '000023', ''],
  ['Stanbic IBTC Bank', '000012', '221'],
  ['Standard Chartered Bank', '000021', '068'],
  ['Sterling Bank', '000001', '232'],
  ['SunTrust Bank', '000022', '100'],
  ['Taj Bank', '000026', ''],
  ['Titan Trust Bank', '000025', '102'],
  ['UBA', '000004', '033'],
  ['Union Bank', '000018', '032'],
  ['Unity Bank', '000011', '215'],
  ['Wema Bank', '000017', '035'],
  ['Zenith Bank', '000015', '057'],
];

// [id, name, charge in kobo]
const TRANSACTION_TYPES = [
  [1, 'Deposit', 0n],
  [2, 'Withdrawal', 0n],
  [3, 'Airtime', 0n],
  [4, 'Data', 0n],
  [5, 'CableTv', 10000n],
  [6, 'Electricity', 10000n],
  [7, 'WalletTransfer', 0n],
  [8, 'BankTransfer', 2000n],
  [9, 'POS', 0n],
  [10, 'LoanRepayment', 0n],
];

async function createDemoUser({ first_name, last_name, phone, email, username, accountNo, balanceKobo, apiKeySuffix }) {
  const user = await prisma.user.create({
    data: {
      first_name,
      last_name,
      phone,
      email,
      username,
      company: 'Demo Company',
      password: await bcrypt.hash('password123', 10),
      pin: await bcrypt.hash('1234', 10),
      virtual_account: accountNo,
      account_reference: `demoRef${apiKeySuffix}0000000000`.slice(0, 20),
      api_key: `demo_api_key_${apiKeySuffix}`.padEnd(32, '0'),
      wallets: { create: { account_number: accountNo, is_primary: true, balance: balanceKobo } },
      notifications: {
        create: { title: 'Welcome', message: `Welcome ${first_name}! Your account ${accountNo} is ready.` },
      },
    },
  });

  // Opening credit so statements/loan-eligibility have data to work with.
  const wallet = await prisma.wallet.findFirst({ where: { user_id: user.id } });
  await prisma.transaction.create({
    data: {
      transaction_reference: `SEED${user.id}${accountNo.slice(-6)}`,
      user_id: user.id,
      wallet_id: wallet.id,
      transaction_type_id: 1,
      direction: 'Credit',
      amount: balanceKobo,
      balance_after: balanceKobo,
      description: 'Opening deposit',
      status: 'Successful',
    },
  });
  return user;
}

async function main() {
  for (const [bank_name, bank_code, short_code] of BANKS) {
    await prisma.bank.upsert({
      where: { bank_code },
      create: { bank_name, bank_code, short_code },
      update: { bank_name, short_code },
    });
  }

  for (const [id, name, charge] of TRANSACTION_TYPES) {
    await prisma.transactionType.upsert({
      where: { id },
      create: { id, name, charge },
      update: { name, charge },
    });
  }

  if ((await prisma.slider.count()) === 0) {
    await prisma.slider.createMany({
      data: [
        { image_url: 'https://placehold.co/800x300?text=Welcome+to+Matrix+Banking', link_url: '' },
        { image_url: 'https://placehold.co/800x300?text=Instant+Loans', link_url: '' },
      ],
    });
  }

  if ((await prisma.user.count()) === 0) {
    const demo = await createDemoUser({
      first_name: 'Demo',
      last_name: 'User',
      phone: '08011111111',
      email: 'demo@example.com',
      username: 'demo',
      accountNo: '5011111111',
      balanceKobo: 5000000n, // NGN 50,000
      apiKeySuffix: '1',
    });
    await createDemoUser({
      first_name: 'Second',
      last_name: 'User',
      phone: '08022222222',
      email: 'demo2@example.com',
      username: 'demo2',
      accountNo: '5022222222',
      balanceKobo: 1000000n, // NGN 10,000
      apiKeySuffix: '2',
    });

    // Demo POS terminal owned by the first user (pin 2351).
    await prisma.posTerminal.create({
      data: {
        serial_number: '6476464734685635',
        pin: await bcrypt.hash('2351', 10),
        user_id: demo.id,
        status: 'Active',
      },
    });
  }

  console.log('Seed completed: banks, transaction types, sliders, demo users (demo/demo2 -> password123, pin 1234).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
