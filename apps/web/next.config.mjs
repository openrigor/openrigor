/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["dev.evaluchat.org"],
  eslint: {
    // Disable ESLint during builds for now to allow warnings
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow TypeScript warnings during builds
    ignoreBuildErrors: false,
  },
  // Turbopack (dev): pin shared + web to one React tree.
  // Do NOT alias React in webpack — prod builds must use Next's compiled
  // React (canary with useOptimistic) or nuqs fails to compile.
  experimental: {
    turbo: {
      resolveAlias: {
        react: "../../node_modules/react",
        "react-dom": "../../node_modules/react-dom",
      },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.globalObject = "self";
    }
    return config;
  },
  async rewrites() {
    // IMPORTANT: use `fallback`, not a bare array (afterFiles).
    // afterFiles rewrites run BEFORE dynamic App Router routes, so API
    // routes would be proxied to LangGraph instead of Next handlers.
    // fallback runs only after Next's own static + dynamic routes miss.
    const langgraphUrl =
      process.env.LANGGRAPH_API_URL || "http://127.0.0.1:54367";
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${langgraphUrl}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
