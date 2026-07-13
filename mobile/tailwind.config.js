/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Light Google-Pay style white + single-blue theme (no green, no dark hero).
        // Token names kept stable; only values changed.
        navy: '#202124',
        'navy-light': '#3c4043',
        ink: '#202124',
        brand: '#1a73e8',
        'brand-mint': '#5e9bf0',
        'brand-glow': '#c6dcfb',
        lav: '#d9e7fd',
        'lav-soft': '#e8f0fe',
        'lav-faint': '#f1f5fa',
        page: '#ffffff',
        muted: '#5f6472',
        faded: '#9aa4b2',
        danger: '#c5221f',
        'danger-soft': '#fce8e6',
        success: '#1a73e8',
        'success-soft': '#e8f0fe',
        card: '#ffffff',
        border: '#eceff3',
        rose: '#d93025',
        'rose-soft': '#fce8e6',
      },
    },
  },
  plugins: [],
};
