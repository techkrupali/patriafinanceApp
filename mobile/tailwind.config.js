/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // "Indigo Heritage" — deep indigo + royal blue + restrained gold. Token names stable.
        navy: '#0B1233',
        'navy-light': '#1B2A63',
        ink: '#0D1430',
        brand: '#2E5BF0',
        'brand-deep': '#1E40C8',
        'brand-mint': '#6089F4',
        'brand-glow': '#C6D6FF',
        gold: '#E4B15C',
        'gold-deep': '#CE9736',
        'gold-soft': '#F7EDD7',
        lav: '#D6E1FA',
        'lav-soft': '#E7EEFE',
        'lav-faint': '#EFF3FE',
        page: '#F3F6FD',
        'page-top': '#E9EEFF',
        muted: '#59647F',
        faded: '#93A0BE',
        danger: '#D5443C',
        'danger-soft': '#FCEAE8',
        success: '#2E5BF0',
        'success-soft': '#E9EEFF',
        card: '#FFFFFF',
        border: '#E5E9F5',
        rose: '#EF5D6B',
        'rose-soft': '#FDEBEE',
      },
    },
  },
  plugins: [],
};
