/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['simli-client'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'simli-client': false,
      }
    }
    return config
  },
  async redirects() {
    return [
      {
        source: '/supuestos',
        destination: '/explorar',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
