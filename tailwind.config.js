/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        twitch: '#9146FF',
        youtube: '#FF0000',
        kick: '#53FC18',
        tiktok: '#010101',
        facebook: '#1877F2'
      }
    }
  },
  plugins: []
}
