/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Client style fix (video 2026-10-17): every button/box corner is 3px —
      // use plain `rounded`. Mirrors `radius` in src/theme.ts.
      borderRadius: {
        DEFAULT: '3px',
      },
      colors: {
        // "The Curated Ledger" — treasury navy + grounded green (gold retired
        // per client video 2026-08-03). Token names stable; values mirror src/theme.ts.
        navy: '#011D35',
        'navy-light': '#173A5C',
        ink: '#171C1F',
        brand: '#006D2F',
        'brand-deep': '#005322',
        'brand-mint': '#3DE273',
        'brand-glow': '#66FF8E',
        gold: '#0F8A44',
        'gold-deep': '#006D2F',
        'gold-soft': '#DFF2E5',
        lav: '#DFE3E7',
        'lav-soft': '#E4E9ED',
        'lav-faint': '#EAEEF2',
        page: '#F6FAFE',
        'page-top': '#F0F4F8',
        muted: '#49607C',
        faded: '#8C9AA9',
        danger: '#BA1A1A',
        'danger-soft': '#FFDAD6',
        success: '#006D2F',
        'success-soft': '#E2F3E9',
        card: '#FFFFFF',
        border: '#E4E9ED',
        rose: '#93000A',
        'rose-soft': '#FFE9E6',
      },
    },
  },
  plugins: [],
};
