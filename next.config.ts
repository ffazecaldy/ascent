import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  // Web-only: servita da `next start` (nessun export statico/exe).
  trailingSlash: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Le PAGINE HTML non vanno MAI cachate a lungo: dopo ogni deploy
        // il browser deve riscaricarle (i chunk _next/static sono hashati
        // e restano immutable). Senza questo, Brave/Edge servivano la
        // versione vecchia dell'app per giorni.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
