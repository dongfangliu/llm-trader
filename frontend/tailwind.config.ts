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
        'ios-label': '#000000',
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
        'ios': '0 2px 16px rgba(0,0,0,0.08)',
        'ios-lg': '0 8px 32px rgba(0,0,0,0.12)',
      },
      fontFamily: {
        'ios': ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      minHeight: {
        'touch': '44px',
      }
    }
  },
  plugins: [],
} satisfies Config
