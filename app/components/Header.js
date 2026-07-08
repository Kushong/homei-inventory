'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// 무동작(inactivity) 자동 로그아웃 설정
const IDLE_MS = 2 * 60 * 60 * 1000; // 2시간
const IDLE_KEY = 'homei_last_activity';

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
      // 새 로그인은 무동작 타이머 기준시각을 새로 잡고, 로그아웃 시 기록 제거.
      if (event === 'SIGNED_IN') {
        try { localStorage.setItem(IDLE_KEY, String(Date.now())); } catch (_) {}
      } else if (event === 'SIGNED_OUT') {
        try { localStorage.removeItem(IDLE_KEY); } catch (_) {}
      }
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

  // 로그인 상태에서 2시간 무동작이면 자동 로그아웃.
  // 활동(마우스·키·클릭·스크롤·터치)마다 기준시각 갱신 → 그동안은 안 풀림.
  // 마지막 활동시각을 localStorage에 저장 → 새로고침/재접속해도 이어서 계산.
  useEffect(() => {
    if (!name) return; // 비로그인이면 타이머 없음

    let timer = null;
    let lastWrite = 0;

    async function doLogout() {
      try { await supabase.auth.signOut(); } catch (_) {}
      try { localStorage.removeItem(IDLE_KEY); } catch (_) {}
      router.push('/');
      router.refresh();
    }

    function tick() {
      let last = 0;
      try { last = Number(localStorage.getItem(IDLE_KEY) || 0); } catch (_) {}
      if (!last) {
        last = Date.now();
        try { localStorage.setItem(IDLE_KEY, String(last)); } catch (_) {}
      }
      const leftMs = IDLE_MS - (Date.now() - last);
      if (leftMs <= 0) { doLogout(); return; }
      // 남은 시간이 길면 최대 1분 간격으로만 재확인 (가벼움)
      timer = setTimeout(tick, Math.min(leftMs, 60000));
    }

    function markActivity() {
      const now = Date.now();
      if (now - lastWrite < 30000) return; // 30초에 한 번만 기록 (mousemove 폭주 방지)
      lastWrite = now;
      try { localStorage.setItem(IDLE_KEY, String(now)); } catch (_) {}
    }

    // 세션 시작 시 기준시각이 없으면 지금으로. 있으면 그대로 이어서 계산.
    try {
      if (!localStorage.getItem(IDLE_KEY)) localStorage.setItem(IDLE_KEY, String(Date.now()));
    } catch (_) {}
    tick();

    const opts = { passive: true };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((e) => window.addEventListener(e, markActivity, opts));

    // 다른 탭에서 로그인/로그아웃/활동이 바뀌면 즉시 반영
    function onStorage(e) { if (e.key === IDLE_KEY) tick(); }
    window.addEventListener('storage', onStorage);
    // 탭이 다시 보일 때 만료 여부 즉시 확인
    function onVisible() { if (document.visibilityState === 'visible') tick(); }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, markActivity, opts));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function signOut() {
    try { localStorage.removeItem(IDLE_KEY); } catch (_) {}
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
