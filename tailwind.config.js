/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        bg: '#0A0A0B',
        surface: '#131316',
        border: '#26262A',
        fg: '#F4F4F5',
        muted: '#71717A',
        over: '#EF4444',
        under: '#10B981',
        background: '#0A0A0B',
        foreground: '#F4F4F5',
        card: '#131316',
        'card-foreground': '#F4F4F5',
        primary: { DEFAULT: '#F4F4F5', foreground: '#0A0A0B' },
        secondary: { DEFAULT: '#131316', foreground: '#F4F4F5' },
        destructive: { DEFAULT: '#EF4444', foreground: '#F4F4F5' },
        ring: '#26262A',
        input: '#26262A',
        popover: { DEFAULT: '#131316', foreground: '#F4F4F5' },
        accent: { DEFAULT: '#26262A', foreground: '#F4F4F5' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '6px', md: '4px', sm: '3px',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
