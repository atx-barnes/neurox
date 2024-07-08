/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    fontLoaders: [
      {
        loader: "@next/font/google",
        options: {
          display: "swap",
          timeout: 10000, // Increase the timeout to 10 seconds
        },
      },
    ],
  },
};

export default nextConfig;
