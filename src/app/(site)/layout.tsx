import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FeedTicker from "@/components/FeedTicker";

// Storefront chrome. Applies to every public page but NOT to /admin (which
// lives outside this route group), so the admin panel gets a clean shell.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <FeedTicker />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
