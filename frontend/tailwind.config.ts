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
        'ios-blue': '#007aff',
        'ios-green': '#34c759',
        'ios-red': '#ff3b30',
        'ios-orange': '#ff9500',
        'ios-yellow': '#ffcc00',
        'ios-bg': '#f2f2f7',
        'ios-bg2': '#e5e5ea',
        'ios-card': '#ffffff',
        'ios-label': '#1c1c1e',
        'ios-label2': '#3c3c43',
        'ios-secondary': '#8e8e93',
        'ios-tertiary': '#aeaeb2',
        'ios-separator': 'rgba(60,60,67,0.12)',
        'ios-fill': 'rgba(120,120,128,0.2)',
      },
      borderRadius: {
        'ios-sm': '10px',
        'ios': '14px',
        'ios-lg': '20px',
        'ios-xl': '28px',
      },
      boxShadow: {
        'ios-sm': '0 1px 2px rgba(60,60,67,0.05)',
        'ios': '0 1px 2px rgba(60,60,67,0.04), 0 4px 16px rgba(60,60,67,0.06)',
        'ios-lg': '0 2px 8px rgba(60,60,67,0.06), 0 12px 32px rgba(60,60,67,0.1)',
      },
      fontFamily: {
        'ios': ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      letterSpacing: {
        'ios-tight': '-0.02em',
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
