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
        // Token names from "The Curated Ledger"; values are the client prototype's
        // emerald palette since 2026-10-27. Mirrors src/theme.ts.
        navy: '#08392F',
        'navy-light': '#0B5D4B',
        ink: '#0E1A16',
        brand: '#0B5D4B',
        'brand-deep': '#08392F',
        'brand-mint': '#5FD3A5',
        'brand-glow': '#5FD3A5',
        gold: '#1FA07A',
        'gold-deep': '#0B5D4B',
        'gold-soft': '#DFF3EA',
        lav: '#D3E3DA',
        'lav-soft': '#E3ECE6',
        'lav-faint': '#EBF2EE',
        page: '#F3F7F4',
        'page-top': '#EAF1EC',
        muted: '#3D5249',
        faded: '#6F8A7E',
        danger: '#B3311A',
        'danger-soft': '#FBE3DD',
        success: '#127A55',
        'success-soft': '#DDF4E9',
        card: '#FFFFFF',
        border: '#D3E3DA',
        rose: '#B3311A',
        'rose-soft': '#FBE3DD',
      },
    },
  },
  plugins: [],
};
