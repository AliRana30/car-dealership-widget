import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import ExtensionErrorSuppressor from "@/components/ExtensionErrorSuppressor";
import "./globals.css";

export const metadata: Metadata = {
  title: "Widgetized - Autonomous AI Voice & Text Front Desk",
  description: "An intelligent voice & text agent for your business — answers calls, navigates pages, and books appointments 24/7.",
  icons: {
    icon: "/favicon.svg",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
  }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ExtensionErrorSuppressor />
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        {children}
      </body>
    </html>
  );
}
