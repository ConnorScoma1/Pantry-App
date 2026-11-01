import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    "@kitchen-pantry/database",
    "@kitchen-pantry/grocery-pricing",
    "@kitchen-pantry/integrations",
    "@kitchen-pantry/inventory-engine",
    "@kitchen-pantry/meal-planner",
    "@kitchen-pantry/shared-types",
    "@kitchen-pantry/ui-tokens",
    "@kitchen-pantry/validation",
  ],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
