import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // A Server Action carries the uploaded document, and the default cap is 1 MB
    // — a scanned clinic PDF is routinely larger. lib/documents.ts refuses
    // anything above 10 MB; the extra megabyte here is room for the multipart
    // boundaries and part headers, which count towards the raw body.
    serverActions: { bodySizeLimit: '11mb' },
  },
};

export default nextConfig;
