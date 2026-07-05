'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

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
      // 로그인 성공 → 서버 세션까지 확실히 반영되도록 전체 새로고침으로 이동
      window.location.assign(next);
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
