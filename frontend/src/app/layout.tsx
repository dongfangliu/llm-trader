import '@/styles/globals.css';
import type { Metadata } from 'next';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || '财财技术洞见';

export const metadata: Metadata = {
  title: APP_NAME,
  description: '基于 AI 大模型的股票与期货智能分析工具，支持 A股、港股、美股、期货，提供买卖建议、技术指标与风险分析。',
  keywords: ['股票分析', '期货分析', 'AI交易', '技术指标', '买卖建议', '财财技术洞见'],
  openGraph: {
    title: APP_NAME,
    description: '基于 AI 大模型的股票与期货智能分析工具，支持 A股、港股、美股、期货。',
    type: 'website',
    locale: 'zh_CN',
  },
  robots: {
    index: true,
    follow: true,
  },
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
