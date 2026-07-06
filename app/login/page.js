'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const supabase = createClient();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // 이미 로그인된 상태로 /login 에 오면 바로 홈(또는 next)으로 보냄
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setErr('');
    if (!email || !password) { setErr('이메일과 비밀번호를 입력하세요.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErr('로그인 실패: ' + error.message);
        setLoading(false);
        return;
      }
      // 세션 쿠키가 브라우저에 확실히 기록될 때까지 한 번 더 확인
      await supabase.auth.getSession();
      // 서버 컴포넌트가 새 세션을 읽도록 전체 새로고침으로 이동
      // replace: 로그인 후 뒤로가기 시 로그인폼이 다시 뜨지 않게
      window.location.replace(next);
    } catch (e) {
      setErr('로그인 중 오류: ' + (e?.message || String(e)));
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ fontSize: 22 }}>
          HOME<span className="plus-i">+I</span>
        </div>
        <h1>관리자 로그인</h1>
        <p className="lead">등록된 관리자만 입·출고를 기록할 수 있습니다.</p>

        {err && <div className="form-error">{err}</div>}

        <div className="field">
          <label>이메일 · Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="admin@example.com"
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label>비밀번호 · Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        <button className="btn" onClick={submit} disabled={loading}>
          {loading ? '로그인 중…' : '로그인'}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
