import { useLanguage, type Lang } from '../store/language';

/**
 * Onboarding and log-in copy. English is the prototype's wording; Pidgin
 * follows the prototype's language toggle (ONB-03).
 */
const en = {
  step: (n: number, total: number) => `STEP ${n} OF ${total}`,
  continue: 'Continue',

  welcome: {
    lines: ['See it.', 'Agree on it.', 'Grow it.'],
    slides: [
      'Shared wallets, approvals and goals for your whole family, with every naira visible to the people it belongs to.',
      'Big payments wait for a yes from the people you choose, so nobody spends shared money alone.',
      'Save for school fees, rent and projects together, with rules that run on their own.',
    ],
    createAccount: 'Create account',
    logIn: 'Log in',
    invite: 'I have an invite',
    bankedBy: 'Banking by Assetmatrix MFB',
  },

  phone: {
    title: "What's your phone number?",
    subtitle: "We'll send you a 6-digit code to check it's you.",
    label: 'Phone number',
    sendBy: 'Send the code by',
    sms: 'SMS',
    whatsapp: 'WhatsApp',
    termsLead: 'By continuing you agree to our ',
    terms: 'Terms',
    and: ' and ',
    privacy: 'Privacy notice',
    invalid: 'Enter a valid phone number.',
  },

  code: {
    title: 'Enter the code',
    sentLead: (channel: string) => `We sent a 6-digit code by ${channel} to `,
    resendIn: "Didn't get it? You can resend in ",
    resendLead: "Didn't get it? ",
    resend: 'Send it again',
    viaWhatsapp: 'Send by WhatsApp instead',
    viaSms: 'Send by SMS instead',
    changePhone: 'Change phone number',
    verify: 'Verify',
    incomplete: 'Enter the 6-digit code.',
    devCode: 'Dev code',
  },

  details: {
    title: 'What should we call you?',
    subtitle: 'Use the name on your BVN so verification goes smoothly.',
    first: 'First name',
    last: 'Last name',
    email: 'Email',
    emailHint: 'For statements and receipts',
    dob: 'Date of birth',
    dobPlaceholder: 'Pick a date',
    nameRequired: 'Enter your first and last name.',
    emailInvalid: 'Enter a valid email address.',
    dobRequired: 'Pick your date of birth.',
  },

  pin: {
    title: 'Create your 6-digit PIN',
    subtitle: "You'll use it to approve and send money. Avoid your birthday or 123456.",
    confirmTitle: 'Enter it again',
    confirmSubtitle: 'To make sure you remember it',
    mismatch: "Those PINs don't match. Create it again.",
    weak: 'Pick a harder PIN. Avoid your birthday, and repeated or sequential numbers like 123456.',
    creating: 'Creating your account…',
  },

  biometric: {
    title: (label: string) => `Use ${label}?`,
    body: 'Open Patriai and approve payments with a glance. Your PIN still works.',
    turnOn: (label: string) => `Turn on ${label}`,
    notNow: 'Not now',
    failed: 'Could not confirm. You can turn this on later in Security.',
  },

  purpose: {
    title: 'What brings you to Patriai?',
    subtitle: "Pick all that apply. We'll suggest wallets to start with.",
    options: {
      household: 'Run our household money together',
      school_goals: 'Save for school fees and goals',
      project: 'Fund a building or family project',
      ajo: 'Run a contribution circle (ajo)',
      children: "Manage my children's money",
      vendor: "I'm a vendor or contractor",
    },
  },

  ready: {
    title: 'Your main wallet is ready',
    subtitle: 'Anyone can send you money with these details. It lands in your main wallet.',
    accountNumber: 'Account number',
    copy: 'Copy',
    copied: 'Copied',
    bank: 'Bank',
    name: 'Name',
    pending: 'Your account number is being set up. It will show here in a moment.',
    nextSteps: 'NEXT STEPS',
    verifyBvn: 'Verify your BVN to raise limits',
    inviteFamily: 'Invite your family',
    firstWallet: 'Create your first shared wallet',
    goHome: 'Go to home',
  },

  login: {
    title: 'Welcome back',
    subtitle: 'Log in with your phone number',
    createAccount: 'Create an account',
  },

  unlock: {
    hi: (name: string) => `Hi ${name}`,
    enterPin: 'Enter your PIN',
    forgot: 'Forgot PIN?',
  },

  forgot: {
    title: 'Reset your PIN',
    emailTitle: 'Check your email',
    emailLead: 'We sent a 6-digit code to ',
    newPinTitle: 'Set a new PIN',
    newPinSubtitle: 'Use 6 digits. Avoid your birthday or 123456.',
  },
};

type Copy = typeof en;

const pcm: Copy = {
  step: (n, total) => `STEP ${n} OF ${total}`,
  continue: 'Continue',

  welcome: {
    lines: ['See am.', 'Agree on am.', 'Grow am.'],
    slides: [
      'Wallet wey una share, approval and goals for your whole family. Everybody go see every naira wey concern am.',
      'Big payment go wait make the people wey you choose talk yes, so nobody go spend family money alone.',
      'Save for school fees, rent and project together, with rules wey dey run by themselves.',
    ],
    createAccount: 'Open account',
    logIn: 'Log in',
    invite: 'I get invite',
    bankedBy: 'Banking by Assetmatrix MFB',
  },

  phone: {
    title: 'Wetin be your phone number?',
    subtitle: 'We go send you 6-digit code to confirm say na you.',
    label: 'Phone number',
    sendBy: 'Send the code with',
    sms: 'SMS',
    whatsapp: 'WhatsApp',
    termsLead: 'If you continue, you don agree to our ',
    terms: 'Terms',
    and: ' and ',
    privacy: 'Privacy notice',
    invalid: 'Put correct phone number.',
  },

  code: {
    title: 'Put the code',
    sentLead: (channel) => `We don send 6-digit code by ${channel} to `,
    resendIn: 'You never see am? You fit resend am for ',
    resendLead: 'You never see am? ',
    resend: 'Send am again',
    viaWhatsapp: 'Send am for WhatsApp instead',
    viaSms: 'Send am by SMS instead',
    changePhone: 'Change phone number',
    verify: 'Confirm',
    incomplete: 'Put the 6-digit code.',
    devCode: 'Dev code',
  },

  details: {
    title: 'Wetin we go dey call you?',
    subtitle: 'Use the name wey dey your BVN make verification go smooth.',
    first: 'First name',
    last: 'Last name',
    email: 'Email',
    emailHint: 'For statement and receipt',
    dob: 'Date wey dem born you',
    dobPlaceholder: 'Choose date',
    nameRequired: 'Put your first name and last name.',
    emailInvalid: 'Put correct email address.',
    dobRequired: 'Choose the date wey dem born you.',
  },

  pin: {
    title: 'Create your 6-digit PIN',
    subtitle: 'Na im you go use approve and send money. No use your birthday or 123456.',
    confirmTitle: 'Put am again',
    confirmSubtitle: 'Make we sure say you remember am',
    mismatch: 'The two PIN no match. Create am again.',
    weak: 'Choose PIN wey hard small. No use your birthday, or number wey repeat or follow each other like 123456.',
    creating: 'We dey open your account…',
  },

  biometric: {
    title: (label) => `You wan use ${label}?`,
    body: 'Open Patriai and approve payment quick quick. Your PIN still dey work.',
    turnOn: (label) => `On ${label}`,
    notNow: 'No be now',
    failed: 'E no confirm. You fit on am later for Security.',
  },

  purpose: {
    title: 'Wetin bring you come Patriai?',
    subtitle: 'Pick everything wey concern you. We go suggest wallet wey you fit start with.',
    options: {
      household: 'Run our house money together',
      school_goals: 'Save for school fees and goals',
      project: 'Fund building or family project',
      ajo: 'Run contribution circle (ajo)',
      children: 'Manage my pikin dem money',
      vendor: 'I be vendor or contractor',
    },
  },

  ready: {
    title: 'Your main wallet don ready',
    subtitle: 'Anybody fit send you money with these details. E go land for your main wallet.',
    accountNumber: 'Account number',
    copy: 'Copy',
    copied: 'E don copy',
    bank: 'Bank',
    name: 'Name',
    pending: 'We still dey set up your account number. E go show here soon.',
    nextSteps: 'WETIN NEXT',
    verifyBvn: 'Verify your BVN make your limit increase',
    inviteFamily: 'Invite your family',
    firstWallet: 'Create your first shared wallet',
    goHome: 'Go home',
  },

  login: {
    title: 'Welcome back',
    subtitle: 'Log in with your phone number',
    createAccount: 'Open account',
  },

  unlock: {
    hi: (name) => `How far, ${name}`,
    enterPin: 'Put your PIN',
    forgot: 'You forget PIN?',
  },

  forgot: {
    title: 'Reset your PIN',
    emailTitle: 'Check your email',
    emailLead: 'We don send 6-digit code to ',
    newPinTitle: 'Set new PIN',
    newPinSubtitle: 'Use 6 numbers. No use your birthday or 123456.',
  },
};

const copies: Record<Lang, Copy> = { en, pcm };

export type OnboardingPurpose = keyof Copy['purpose']['options'];

export function useOnboardingCopy(): Copy {
  return copies[useLanguage((s) => s.lang)];
}

/**
 * The server's weak-PIN rules (SecurityService::weakPinReason), so a weak PIN is
 * refused on the PIN step rather than after it: one digit repeated, a run that
 * may wrap (123456, 890123, 987654), the common patterns, the birthday
 * (`YYYY-MM-DD`) written ddmmyy / mmddyy / yymmdd / yyddmm, the phone's last digits.
 */
export function isWeakPin(pin: string, dateOfBirth?: string | null, phone?: string | null): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = pin.split('').map(Number);
  const run = (step: number) => digits.every((d, i) => i === 0 || d === (digits[i - 1] + step + 10) % 10);
  if (run(1) || run(-1) || ['121212', '112233', '123123', '111222', '000111'].includes(pin)) return true;
  const dob = dateOfBirth?.match(/^\d{2}(\d{2})-(\d{2})-(\d{2})/);
  if (dob) {
    const [, y, m, d] = dob;
    if ([d + m + y, m + d + y, y + m + d, y + d + m].includes(pin)) return true;
  }
  return Boolean(phone && phone.replace(/\D/g, '').endsWith(pin));
}
