import type { Metadata } from "next";
import { BrandHeader } from "../components/brand-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Remaker | 创生纪短视频工作台",
  description: "本地运行的短视频结构学习与原创改编工作台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <BrandHeader />
        {children}
      </body>
    </html>
  );
}
