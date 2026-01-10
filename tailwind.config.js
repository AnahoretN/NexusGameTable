/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./store/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
    "./main.tsx",
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