import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Private Sites · HOME+I',
};

export default async function PrivatePage() {
  const supabase = await createClient();

  // 로그인 + 최고관리자(super) 여부 서버사이드 검사
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: prof } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (prof?.role !== 'super') redirect('/');

  // ── 여기부터 Private Sites 내용 (지금은 빈 페이지 / 준비 중) ──
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 20px' }}>
      <div
        style={{
          border: '1px dashed #d4d4d8',
          borderRadius: 16,
          padding: '64px 24px',
          textAlign: 'center',
          color: '#71717a',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#27272a', margin: '0 0 8px' }}>
          Private Sites
        </h1>
        <p style={{ margin: 0, fontSize: 14 }}>
          최고관리자 전용 공간입니다. 내용은 준비 중이에요.
        </p>
      </div>
    </main>
  );
}
