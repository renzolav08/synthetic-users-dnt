/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // En el servidor ignorar simli-client (browser-only)
      config.resolve.alias = {
        ...config.resolve.alias,
        'simli-client': false,
      }
    } else {
      // En el cliente, proveer require como no-op para que simli-client no rompa
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
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
