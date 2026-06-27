/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // simli-client usa APIs de browser (WebRTC) — excluir del bundle de webpack
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
      ({ request }, callback) => {
        if (request === 'simli-client') return callback(null, `commonjs ${request}`)
        callback()
      },
    ]
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