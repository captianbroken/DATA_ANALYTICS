/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          primary: {
            DEFAULT: '#005baa', // Hyperspark Dark Blue
            foreground: '#ffffff',
          },
          secondary: {
            DEFAULT: '#00adef', // Hyperspark Light Blue/Cyan
            foreground: '#ffffff',
          },
          background: '#f8fafc',
          foreground: '#0f172a',
          card: {
            DEFAULT: '#ffffff',
            foreground: '#0f172a',
          },
          border: '#e2e8f0',
          destructive: {
            DEFAULT: '#ef4444',
            foreground: '#ffffff',
          },
        },
      },
    },
    plugins: [],
  }
