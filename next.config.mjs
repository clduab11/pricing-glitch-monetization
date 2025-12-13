/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  // Image domains for product images from retailers
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazon.com' },
      { protocol: 'https', hostname: '**.walmart.com' },
      { protocol: 'https', hostname: '**.target.com' },
      { protocol: 'https', hostname: '**.bestbuy.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: 'i5.walmartimages.com' },
    ],
  },

  // Experimental features for better performance
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
};

export default nextConfig;
