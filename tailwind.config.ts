import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        fg: '#FFFFFF',
        accent: '#D4AF37',
        muted: '#6B6B6B',
        surface: '#0F0F0F',
        border: '#1A1A1A'
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Inter',
          'Roboto',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};

export default config;
