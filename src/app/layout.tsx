import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Toaster } from "react-hot-toast";
import ExtensionErrorSuppressor from "@/components/ExtensionErrorSuppressor";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-figtree",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "AutoMate - Autonomous AI Dealership Voice & Inventory Intelligence",
  description: "An intelligent AI voice & text agent for automotive dealerships — retrieves new & used inventory, answers vehicle inquiries, navigates VDPs, and guides shoppers 24/7.",
  icons: {
    icon: "/automate.png",
    shortcut: "/automate.png",
    apple: "/automate.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={figtree.variable} suppressHydrationWarning>
      <body className={figtree.className} suppressHydrationWarning>
        <ExtensionErrorSuppressor />
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        {children}
      </body>
    </html>
  );
}
