/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      './index.html',
      './src/**/*.{js,ts,jsx,tsx}',    // чтобы Tailwind видел ваши файлы в src
      './node_modules/tw-animate-css/dist/*.js', // если используете tw-animate-css
    ],
    theme: {
      extend: {},
    },
    plugins: [
      require('@tailwindcss/forms'),     // стили для форм
      require('tw-animate-css'),         // анимации
      require('shadcn-ui/plugin'),
    ],
  }
  