import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626',
        neutral: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 10px 25px -10px rgba(15, 23, 42, 0.2)',
      },
      fontSize: {
        sm: '14px',
        base: '16px',
        lg: '18px',
        h2: '20px',
        h1: '28px',
      },
    },
  },
  plugins: [],
};

export default config;
