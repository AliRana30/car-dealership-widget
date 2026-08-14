import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyFrontDesk - AI Voice Agent for Clinics",
  description: "A dedicated front-desk agent for clinics and appointment-based practices — it answers calls, books appointments, and keeps everyone in the loop.",
  icons: {
    icon: "/logo.png",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
