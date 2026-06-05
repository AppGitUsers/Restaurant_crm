/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          200: '#5DCAA5',
          300: '#2DB88A',
          400: '#1D9E75',
          500: '#0F6E56',
          600: '#085041',
          700: '#04342C',
          DEFAULT: '#1D9E75',
          light: '#9FE1CB',
          dark:  '#085041',
        },
        gold: {
          50:  '#FAEEDA',
          100: '#FAC775',
          200: '#EF9F27',
          300: '#BA7517',
          400: '#854F0B',
          500: '#633806',
          600: '#412402',
          DEFAULT: '#BA7517',
          light: '#FAC775',
          dark:  '#412402',
        },
        surface: '#FAFAF8',
        card:    '#FFFFFF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:  '0 1px 4px 0 rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
        modal: '0 8px 32px 0 rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
