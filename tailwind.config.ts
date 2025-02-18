// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/react-big-calendar/lib/css/react-big-calendar.css"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config