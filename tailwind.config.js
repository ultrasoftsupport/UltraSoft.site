/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./admin.html",
    "./auth.html",
    "./src/js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        ultra: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EB5D4',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
          950: '#082F49'
        },
        darkbg: {
          800: '#1E293B',
          900: '#0B1329',
          950: '#060B14'
        },
        devo: {
          // Base Dark Theme Colors - UltraSoft Mapped
          black: '#0B1329',       // Main application background (Deep Midnight)
          dark: '#0F172A',        // Surface color (Cards, Modals - Slate 900)
          gray: '#1E293B',        // Borders, dividers, and disabled states (Slate 800)
          grayHover: '#334155',   // Hover states for dark elements
          
          // Brand Colors - UltraSoft Primary & Accent
          orange: '#0284C7',      // Primary brand color (Ultra 600 Royal Blue)
          orangeHover: '#0369A1', // Hover state (Ultra 700)
          
          // Typography Colors
          text: '#F8FAFC',        // Primary text
          muted: '#CBD5E1',       // Secondary text
          
          // Semantic Colors
          success: '#10B981',     // Emerald 500
          error: '#EF4444',       // Red 500
          warning: '#F59E0B',     // Amber 500
          info: '#38BDF8'         // Sky 400
        }
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'devo-float': '0 10px 40px -10px rgba(0,0,0,0.8)',
        'ultra-glow': '0 0 20px rgba(0, 240, 255, 0.3)',
      }
    },
  },
  plugins: [],
}