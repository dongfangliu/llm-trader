/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // 将 /api/* 请求在 Next.js 服务端代理给 backend 容器
  // BACKEND_URL 是运行时环境变量，默认指向 Docker 内部网络的 backend 服务
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${backendUrl}/ws/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
