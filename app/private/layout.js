import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { PRIVATE_COOKIE, isUnlockTokenValid } from '@/lib/privateGate';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Private Sites · HOME+I',
};

const NAV = [
  { href: '/private', label: '홈', icon: '🏠', ready: true },
  { href: '/private/notes', label: '메모', icon: '📝', ready: true },
  { href: '/private/todo', label: '할 일', icon: '✅', ready: true },
  { href: '/private/favorites', label: '즐겨찾기', icon: '⭐', ready: false },
  { href: '/private/records', label: '개인 기록', icon: '📦', ready: false },
  { href: '/private/lab', label: '실험실', icon: '🧪', ready: false },
];

export default async function PrivateLayout({ children }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: prof } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.role !== 'super') redirect('/');

  // 비밀번호 재확인 게이트: 유효한 잠금해제 쿠키가 없으면 잠금 화면으로
  const jar = await cookies();
  const token = jar.get(PRIVATE_COOKIE)?.value;
  if (!isUnlockTokenValid(token)) redirect('/private-unlock');

  return (
    <div style={{ display: 'flex', minHeight: '78vh' }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid #e4e4e7',
          background: '#fafafa',
          padding: '20px 12px',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#a1a1aa',
            padding: '0 10px 12px',
            letterSpacing: '0.04em',
          }}
        >
          🔒 PRIVATE SITES
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) =>
            item.ready ? (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 8,
                  fontSize: 14,
                  color: '#27272a',
                  textDecoration: 'none',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ) : (
              <div
                key={item.href}
                title="준비 중"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 8,
                  fontSize: 14,
                  color: '#c4c4cc',
                  cursor: 'default',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#d4d4d8' }}>준비 중</span>
              </div>
            )
          )}
        </nav>
      </aside>
      <main style={{ flex: 1, minWidth: 0, padding: '28px 32px' }}>{children}</main>
    </div>
  );
}
