import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "短视频复刻自动化工作台",
  description: "Structure-learning and original-remake workflow for short videos"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
