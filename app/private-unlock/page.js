'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PrivateUnlockPage() {
  const supabase = createClient();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // 로그인 안 되어 있으면 로그인 페이지로
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.replace('/login?next=/private');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setErr('');
    if (!pw) { setErr('비밀번호를 입력하세요.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/private-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || '확인 실패');
        setLoading(false);
        return;
      }
      window.location.replace('/private');
    } catch (e) {
      setErr('오류: ' + (e?.message || String(e)));
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          border: '1px solid #e4e4e7',
          borderRadius: 16,
          padding: 28,
          background: '#fff',
        }}
      >
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>🔒</div>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 800,
            textAlign: 'center',
            margin: '0 0 4px',
            color: '#18181b',
          }}
        >
          Private Sites 잠금
        </h1>
        <p
          style={{
            fontSize: 13,
            color: '#71717a',
            textAlign: 'center',
            margin: '0 0 20px',
          }}
        >
          계속하려면 계정 비밀번호를 다시 입력하세요.
        </p>

        {err && (
          <div
            style={{
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: 13,
              padding: '8px 12px',
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            {err}
          </div>
        )}

        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="계정 비밀번호"
          autoComplete="current-password"
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '11px 12px',
            border: '1px solid #d4d4d8',
            borderRadius: 10,
            fontSize: 14,
            marginBottom: 12,
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          style={{
            width: '100%',
            padding: 11,
            borderRadius: 10,
            border: 'none',
            background: loading ? '#a1a1aa' : '#18181b',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '확인 중…' : '잠금 해제'}
        </button>
        <p
          style={{
            fontSize: 11,
            color: '#a1a1aa',
            textAlign: 'center',
            margin: '14px 0 0',
          }}
        >
          한 번 해제하면 8시간 동안 다시 묻지 않아요.
        </p>
      </div>
    </div>
  );
}
