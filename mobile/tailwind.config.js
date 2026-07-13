/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Clean white + blue theme (no green). Token names kept stable.
        navy: '#0a1f44',
        'navy-light': '#12376e',
        ink: '#0f1e38',
        brand: '#1f6feb',
        'brand-mint': '#4f9bff',
        'brand-glow': '#bcd7ff',
        lav: '#d7e5fb',
        'lav-soft': '#e8f0fe',
        'lav-faint': '#f0f5ff',
        page: '#f6f9ff',
        muted: '#64748b',
        faded: '#98a6bd',
        danger: '#c62828',
        'danger-soft': '#fde8e8',
        success: '#1f6feb',
        'success-soft': '#eaf1ff',
        card: '#ffffff',
        border: '#e6ecf6',
        rose: '#ef5b6e',
        'rose-soft': '#fdeaec',
      },
    },
  },
  plugins: [],
};
