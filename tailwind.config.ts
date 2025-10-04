/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sand: {
          50: '#F4F0E2',
          100: '#E9E1C6',
          200: '#DCCD9E',
          300: '#CFC17C',
          400: '#C5B38C', // military sand
          500: '#B5A26B',
        },
        sky: {
          100: '#E2EEF7',
          200: '#C7DDF0',
          300: '#A9CAE7',
          400: '#7FA6C9', // military light blue
          500: '#5B86AD',
        },
        arena: {
          lightBg: '#F7F4EC',
          darkBg: '#1E2430',
          darkBlue: '#0E1726',
          darkGray: '#111318'
        }
      }
    }
  },
  plugins: []
}
