module.exports = {
  darkMode: 'class',
  content: [
    './public/**/*.{html,js}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lato', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
};
