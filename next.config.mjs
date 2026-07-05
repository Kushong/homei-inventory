/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // 상품 썸네일을 외부 URL(Supabase Storage 등)에서 불러올 수 있게 허용
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
