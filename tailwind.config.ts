import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        coal: "#171717",
        panel: "#24211c",
        panelSoft: "#302c25",
        line: "#4a4338",
        moss: "#6f7f4f",
        clay: "#b96842",
        sand: "#d0b06d"
      },
      boxShadow: {
        tool: "0 1px 0 rgba(255,255,255,0.08) inset, 0 18px 40px rgba(0,0,0,0.22)"
      }
    }
  },
  plugins: []
};

export default config;
