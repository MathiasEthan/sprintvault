/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // 12 / 13.5 / 16 / 20 / 28
        xs: ['12px', '16px'],
        sm: ['13.5px', '20px'],
        base: ['16px', '24px'],
        lg: ['20px', '26px'],
        xl: ['28px', '32px'],
      },
      colors: {
        // Theme: black x light black x green.
        // `slate` (surfaces, borders, text) is remapped to neutral blacks/greys;
        // `blue`/`cyan` (primary accent) are remapped to green, so existing classes pick up the theme.
        slate: {
          50: '#fafafa',
          100: '#f0f0f0',
          200: '#dcdcdc',
          300: '#c2c2c2',
          400: '#9b9b9b',
          500: '#737373',
          600: '#4f4f4f',
          700: '#343434',
          800: '#232323',
          900: '#151515',
          950: '#070707',
        },
        blue: {
          50: '#effef4',
          100: '#d8fbe5',
          200: '#b2f5cb',
          300: '#7aeba5',
          400: '#3ddc7f',
          500: '#18c461',
          600: '#0c8a40',
          700: '#0b7136',
          800: '#0e5a2e',
          900: '#0d4a27',
          950: '#032914',
        },
        cyan: {
          300: '#7aeba5',
          400: '#3ddc7f',
          500: '#18c461',
        },
        vault: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
    },
  },
  plugins: [],
}
