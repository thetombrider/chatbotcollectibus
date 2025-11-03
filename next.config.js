/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Configurazione per Supabase Edge Functions
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
        ],
      },
    ];
  },
  // Configurazione webpack per tiktoken WASM
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Fix per tiktoken WASM in Next.js
      config.resolve.alias = {
        ...config.resolve.alias,
        '@dqbd/tiktoken': require.resolve('@dqbd/tiktoken'),
      };
    }
    
    // Ignora warning per moduli opzionali
    config.ignoreWarnings = [
      { module: /node_modules\/@dqbd\/tiktoken/ }
    ];

    return config;
  },
};

module.exports = nextConfig;

