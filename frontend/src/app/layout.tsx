import '@/styles/globals.css';
import type { Metadata, Viewport } from 'next';

const DEFAULT_APP_NAME = 'AI股票分析';

export async function generateMetadata(): Promise<Metadata> {
  let appName = DEFAULT_APP_NAME;
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const res = await fetch(`${backendUrl}/api/config`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.app_name) appName = data.app_name;
    }
  } catch {}
  return {
    title: appName,
    description: '基于 AI 大模型的股票与期货智能分析工具，支持 A股、港股、美股、期货，提供买卖建议、技术指标与风险分析。',
    keywords: ['股票分析', '期货分析', 'AI交易', '技术指标', '买卖建议'],
    openGraph: {
      title: appName,
      description: '基于 AI 大模型的股票与期货智能分析工具，支持 A股、港股、美股、期货。',
      type: 'website',
      locale: 'zh_CN',
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
