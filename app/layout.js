import "./globals.css";
export const metadata = { title: "코인 모의투자 트레이너", description: "실제 거래소 앱과 같은 화면으로 연습하는 가상 코인 투자" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
