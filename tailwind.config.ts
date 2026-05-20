import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./renderer-pkg/**/*.{jsx,html}"],
  theme: {
    extend: {
      colors: {
        render: {
          blue: "#007AFF",
          green: "#34C759",
          amber: "#FF9F0A",
          red: "#FF453A",
          purple: "#AF52DE",
          neutral: "#8E8E93",
        },
      },
    },
  },
};

export default config;

