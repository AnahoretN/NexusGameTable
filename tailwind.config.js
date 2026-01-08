/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        table: '#2c3e50',
        felt: '#27ae60',
        wood: '#8e44ad',
      },
      animation: {
        'flip': 'flip 0.6s preserve-3d',
      }
    },
  },
  plugins: [],
}