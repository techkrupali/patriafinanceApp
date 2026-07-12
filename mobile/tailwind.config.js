/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        navy: '#001736',
        'navy-light': '#002b5c',
        ink: '#0b1c30',
        brand: '#006c49',
        'brand-mint': '#4edea3',
        'brand-glow': '#6cf8bb',
        lav: '#d3e4fe',
        'lav-soft': '#e5eeff',
        'lav-faint': '#eff4ff',
        page: '#f8f9ff',
        muted: '#64748b',
        faded: '#94a3b8',
        danger: '#ba1a1a',
        'danger-soft': '#ffdad6',
        success: '#ecfdf5',
      },
    },
  },
  plugins: [],
};
