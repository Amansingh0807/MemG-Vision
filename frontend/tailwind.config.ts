import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'mg-bg': '#05050a',
        'mg-panel': 'rgba(10, 14, 28, 0.85)',
        'mg-border': 'rgba(0, 255, 136, 0.15)',
        'mg-green': '#00ff88',
        'mg-red': '#ff2255',
        'mg-amber': '#ffaa00',
        'mg-blue': '#00aaff',
        'mg-text': '#c8d8f0',
        'mg-muted': '#5a6a80',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
