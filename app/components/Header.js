'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function Header() {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState(null);
  const [isSuper, setIsSuper] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(user) {
      if (!user) { if (active) { setName(null); setIsSuper(false); setReady(true); } return; }
      const { data } = await supabase
        .from('admin_profiles')
        .select('display_name, role')
        .eq('id', user.id)
        .maybeSingle();
      if (active) {
        setName(data?.display_name || user.email);
        setIsSuper(data?.role === 'super');
        setReady(true);
      }
    }

    supabase.auth.getUser().then(({ data }) => load(data.user));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // 토큰 자동 갱신(TOKEN_REFRESHED)·초기 세션(INITIAL_SESSION) 등에서도
      // 이벤트가 오는데, 그때마다 router.refresh()를 부르면 iOS 사파리에서
      // 리렌더가 폭주해 화면이 "버버버벅" 깜빡이고, 로그인 직후의 페이지 이동이 묻힌다.
      // → 실제 로그인/로그아웃 전환에서만 헤더 표시를 갱신한다. (refresh 호출 안 함)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => { load(session?.user); }, 0);
      }
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  function openPrivate() {
    window.open('/private', '_blank', 'noopener,noreferrer');
  }

  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span>HOME<span className="plus-i">+I</span></span>
          <span className="kor">재고 관리</span>
        </Link>
        <div className="header-auth">
          {!ready ? null : name ? (
            <>
              {isSuper && (
                <button
                  type="button"
                  className="chip"
                  onClick={openPrivate}
                  title="최고관리자 전용 페이지"
                >
                  🔒 Private Sites
                </button>
              )}
              <span className="chip"><span className="dot" />{name}</span>
              <button className="chip" onClick={signOut}>로그아웃</button>
            </>
          ) : (
            <Link href="/login" className="chip brand">관리자 로그인</Link>
          )}
        </div>
      </div>
    </header>
  );
}
