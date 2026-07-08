'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const REMEMBER_KEY = 'homei_saved_email';

function LoginForm() {
  const supabase = createClient();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // 저장된 이메일 불러오기 + 이미 로그인돼 있으면 홈으로
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) { setEmail(saved); setRemember(true); }
    } catch {}

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    if (e) e.preventDefault();
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

      // 이메일 기억하기
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {}

      // 크롬·엣지 등: 자격증명 저장 팝업을 프로그램적으로 유도
      // (사파리는 미지원 → 아래 <form> 제출로 네이티브 저장 팝업이 뜸)
      try {
        if (window.PasswordCredential) {
          const cred = new window.PasswordCredential({ id: email, password });
          await navigator.credentials.store(cred);
        }
      } catch {}

      // getSession() 대기 없이 즉시 이동 → 락 데드락 방지
      window.location.replace(next);
    } catch (e2) {
      setErr('로그인 중 오류: ' + (e2?.message || String(e2)));
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

        <form onSubmit={submit} autoComplete="on">
          <div className="field">
            <label>이메일 · Email</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>비밀번호 · Password</label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13.5, color: 'var(--muted)', margin: '2px 0 18px',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
            />
            이메일 기억하기
          </label>

          <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? '로그인 중…' : '로그인'}
          </button>
        </form>
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
