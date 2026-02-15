/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        whatsapp: {
          green: {
            light: '#25D366',
            DEFAULT: '#128C7E',
            dark: '#075E54',
          },
          teal: '#25D366',
          blue: {
            light: '#34B7F1',
            DEFAULT: '#128C7E',
          },
          gray: {
            50: '#f8f9fa',
            100: '#f0f2f5',
            200: '#e4e6eb',
            300: '#d1d5db',
            400: '#9ca3af',
            500: '#6b7280',
            600: '#4b5563',
            700: '#374151',
            800: '#1f2937',
            900: '#111827',
          },
          bg: {
            light: '#f0f2f5',
            dark: '#0c1317',
          },
          border: {
            light: '#e4e6eb',
            dark: '#2a3942',
          },
          text: {
            light: '#111827',
            dark: '#e9edef',
          }
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}