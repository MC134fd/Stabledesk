/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': '#04080f',
        'bg-surface': '#080e1a',
        'bg-card': '#0c1525',
        'bg-card-hover': '#101d30',
        border: '#14213a',
        'border-focus': 'rgba(45, 212, 191, 0.25)',
        teal: {
          DEFAULT: '#2dd4bf',
          dim: 'rgba(45, 212, 191, 0.12)',
          hover: '#5eead4',
        },
        blue: {
          DEFAULT: '#60a5fa',
          dim: 'rgba(96, 165, 250, 0.12)',
        },
        'text-primary': '#e2e8f0',
        'text-secondary': '#8ba3c0',
        'text-muted': '#4a6080',
        'status-green': {
          DEFAULT: '#34d399',
          dim: 'rgba(52, 211, 153, 0.12)',
        },
        'status-yellow': {
          DEFAULT: '#fbbf24',
          dim: 'rgba(251, 191, 36, 0.12)',
        },
        'status-red': {
          DEFAULT: '#f87171',
          dim: 'rgba(248, 113, 113, 0.12)',
        },
        'status-orange': {
          DEFAULT: '#fb923c',
          dim: 'rgba(251, 146, 60, 0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
