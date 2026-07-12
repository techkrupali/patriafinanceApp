/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#001736',
          light: '#002b5c',
          ink: '#0b1c30',
        },
        brand: {
          DEFAULT: '#006c49',
          dark: '#047857',
          deep: '#065f46',
          mint: '#4edea3',
          glow: '#6cf8bb',
        },
        lav: {
          DEFAULT: '#d3e4fe',
          soft: '#e5eeff',
          faint: '#eff4ff',
        },
        page: '#f8f9ff',
        muted: '#64748b',
        faded: '#94a3b8',
        danger: '#ba1a1a',
        'danger-soft': '#ffdad6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(11, 28, 48, 0.06), 0 8px 24px rgba(11, 28, 48, 0.05)',
        cta: '0 10px 24px rgba(0, 23, 54, 0.28)',
      },
    },
  },
  plugins: [],
};
