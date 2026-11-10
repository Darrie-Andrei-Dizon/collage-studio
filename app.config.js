// Extends app.json. EXPO_BASE_URL lets the web build live in a sub-folder,
// e.g. /collage-studio on GitHub Pages (set by .github/workflows/pages.yml).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments ?? {}),
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
