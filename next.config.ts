import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Las fotos definitivas viven en Vercel Blob; las de Airtable son el
    // respaldo mientras el espejo todavía no corrió.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "v5.airtableusercontent.com" },
      { protocol: "https", hostname: "dl.airtable.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
