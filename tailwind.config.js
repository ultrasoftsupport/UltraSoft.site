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
          950: '#082F49',
          // Dynamic Theme Colors mapped via CSS Variables
          black: withOpacity('--ultra-black', '#0B1329'),
          dark: withOpacity('--ultra-dark', '#0F172A'),
          gray: withOpacity('--ultra-gray', '#1E293B'),
          grayHover: withOpacity('--ultra-gray-hover', '#334155'),
          orange: withOpacity('--ultra-orange', '#0284C7'),
          orangeHover: withOpacity('--ultra-orange-hover', '#0369A1'),
          text: withOpacity('--ultra-text', '#F8FAFC'),
          muted: withOpacity('--ultra-muted', '#CBD5E1'),
          success: withOpacity('--ultra-success', '#10B981'),
          error: withOpacity('--ultra-error', '#EF4444'),
          warning: withOpacity('--ultra-warning', '#F59E0B'),
          info: withOpacity('--ultra-info', '#38BDF8')
        },
        darkbg: {
          800: '#1E293B',
          900: '#0B1329',
          950: '#060B14'
        }
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'ultra-float': '0 10px 40px -10px rgba(0,0,0,0.8)',
        'ultra-glow': '0 0 20px rgba(0, 240, 255, 0.3)',
      }
    },
  },
  plugins: [],
}
