/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0D0F12',
        card: '#161920',
        cyanAccent: '#00F0FF',
      },
    },
  },
  plugins: [],
}
