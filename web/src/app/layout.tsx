import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandMenu } from "@/components/layout/command-menu";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "SymBioForge | Dashboard",
  description: "AI-powered industrial symbiosis platform for circular economy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-zinc-950 text-zinc-50 overflow-hidden`}
      >
        <div className="flex h-screen w-full">
          <div className="w-64 flex-shrink-0 hidden md:block">
            <Sidebar />
          </div>
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-auto bg-zinc-950/50">
              <div className="max-w-[1600px] mx-auto px-6 py-8">
                {children}
              </div>
            </main>
          </div>
        </div>
        <CommandMenu />
      </body>
    </html>
  );
}
