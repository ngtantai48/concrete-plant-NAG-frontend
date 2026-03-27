import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'minio.savinatestinghub.com',
        pathname: '/**',
      }
    ],
  },

  logging: {
    fetches: {
      fullUrl: false,
    },
  },

  experimental: {
    turbopackFileSystemCacheForDev: false,
    optimizePackageImports: ['antd', '@ant-design/icons', 'lucide-react', '@fortawesome/fontawesome-svg-core'],
    authInterrupts: true,
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
