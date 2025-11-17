/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'imapflow',
      'mailparser',
      'nodemailer'
    ]
  }
};

export default nextConfig;
