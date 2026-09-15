const withOpacity = (variableName, fallback) => {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `color-mix(in srgb, var(${variableName}, ${fallback}) calc(100% * ${opacityValue}), transparent)`;
    }
    return `var(${variableName}, ${fallback})`;
  };
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
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
          // Dynamic Theme Colors mapped via CSS Variables
          black: withOpacity('--devo-black', '#0B1329'),
          dark: withOpacity('--devo-dark', '#0F172A'),
          gray: withOpacity('--devo-gray', '#1E293B'),
          grayHover: withOpacity('--devo-gray-hover', '#334155'),
          orange: withOpacity('--devo-orange', '#0284C7'),
          orangeHover: withOpacity('--devo-orange-hover', '#0369A1'),
          text: withOpacity('--devo-text', '#F8FAFC'),
          muted: withOpacity('--devo-muted', '#CBD5E1'),
          success: withOpacity('--devo-success', '#10B981'),
          error: withOpacity('--devo-error', '#EF4444'),
          warning: withOpacity('--devo-warning', '#F59E0B'),
          info: withOpacity('--devo-info', '#38BDF8')
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