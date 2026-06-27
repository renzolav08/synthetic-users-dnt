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
      // En el servidor, reemplazar simli-client con módulo vacío (browser-only)
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
