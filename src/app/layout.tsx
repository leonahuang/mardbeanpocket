import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MARD BEAN POCKET - 拼豆教程生成器",
  description: "拼豆教程生成器 — Convert images to MARD bead patterns",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
