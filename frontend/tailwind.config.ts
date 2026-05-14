import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './composables/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        'ios-blue': 'var(--ios-blue)',
        'ios-green': 'var(--ios-green)',
        'ios-red': 'var(--ios-red)',
        'ios-orange': 'var(--ios-orange)',
        'ios-yellow': 'var(--ios-yellow)',
        'ios-bg': 'var(--ios-bg)',
        'ios-bg2': 'var(--ios-bg2)',
        'ios-card': 'var(--ios-card)',
        'ios-label': 'var(--ios-label)',
        'ios-label2': 'var(--ios-label2)',
        'ios-secondary': 'var(--ios-secondary)',
        'ios-tertiary': 'var(--ios-tertiary)',
        'ios-separator': 'var(--ios-separator)',
        'ios-fill': 'var(--ios-fill)',
      },
      borderRadius: {
        'ios-sm': '10px',
        'ios': '14px',
        'ios-lg': '20px',
        'ios-xl': '28px',
      },
      boxShadow: {
        'ios-sm': 'var(--ios-shadow-sm)',
        'ios': 'var(--ios-shadow)',
        'ios-lg': 'var(--ios-shadow-lg)',
      },
      fontFamily: {
        'ios': ['Geist', 'Satoshi', 'Outfit', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'mono': ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      letterSpacing: {
        'ios-tight': '0',
      },
      opacity: {
        '6': '0.06',
        '8': '0.08',
        '12': '0.12',
        '15': '0.15',
        '55': '0.55',
      },
      minHeight: {
        'touch': '44px',
      }
    }
  },
  plugins: [],
} satisfies Config
