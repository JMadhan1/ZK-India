/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // snarkjs pulls in optional native bindings we don't use in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, readline: false };
    return config;
  },
  async headers() {
    // snarkjs proof generation is CPU-heavy; run it off the main thread with a
    // Web Worker. Cross-origin isolation is required for the fastest paths and
    // is harmless otherwise.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
