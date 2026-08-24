import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache-buster: Cloudflare holds truncated copies of /_next/static chunks
  // from a period when the origin streamed responses unbuffered. Serving the
  // same files under a new prefix sidesteps those entries entirely.
  assetPrefix: "/s2",
  // Next.js was serving pre-compressed chunks with the UNCOMPRESSED
  // Content-Length and no Content-Encoding header, so clients (and Cloudflare)
  // saw truncated files. nginx handles compression correctly instead.
  compress: false,
  /* config options here */
};

export default nextConfig;
