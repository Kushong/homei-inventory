import './globals.css';
import Header from './components/Header';

export const metadata = {
  title: 'HOME+I 재고 관리',
  description: 'HOME+I 실시간 입·출고 재고 관리 시스템',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
