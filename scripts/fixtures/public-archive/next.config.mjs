// Keep server and browser domain configuration identical in this isolated harness.
// Never load application secrets or contact production from fixture navigation.
export default {
  env: {
    NEXT_PUBLIC_SITE_URL: "http://localhost:3190",
    NEXT_PUBLIC_PORTAL_URL: "http://localhost:3190",
    NEXT_PUBLIC_ADMIN_URL: "http://localhost:3190",
    NEXT_PUBLIC_API_URL: "http://localhost:3190",
  },
};
