import type { Metadata } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import "./globals.css";
import Track from "@/components/Track";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "BGASkins.cc — CS2 Skins Market",
  description:
    "Покупай скины CS2 по лучшим ценам. Моментальная доставка в Steam, живой каталог, честные цены.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "BGASkins.cc — маркет скинов CS2",
    description:
      "Скины CS2 по честным ценам: живой каталог, моментальная доставка через трейд-оффер.",
    siteName: "BGASkins.cc",
    type: "website",
    images: [{ url: "/art/og-card.jpg", width: 1200, height: 630, alt: "BGASkins.cc" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BGASkins.cc — маркет скинов CS2",
    description: "Скины CS2 по честным ценам. Моментальная доставка в Steam.",
    images: ["/art/og-card.jpg"],
  },
};

// Root layout is intentionally minimal: storefront chrome (header/feed/footer)
// lives in the (site) route group so the /admin surface never renders it.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${chakra.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Track />
        {children}
      </body>
    </html>
  );
}
