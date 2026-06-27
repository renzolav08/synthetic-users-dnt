import webpack from 'webpack'

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
      config.resolve.alias = {
        ...config.resolve.alias,
        'simli-client': false,
      }
    } else {
      // Fix: simli-client require('./Client') falla en Linux (case-sensitive)
      // El archivo real es './client' (minúscula)
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^\.\/Client$/,
          (resource) => {
            if (resource.context && resource.context.includes('simli-client')) {
              resource.request = './client'
            }
          }
        )
      )
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
