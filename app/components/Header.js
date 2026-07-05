'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function Header() {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(user) {
      if (!user) { if (active) { setName(null); setReady(true); } return; }
      const { data } = await supabase
        .from('admin_profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      if (active) { setName(data?.display_name || user.email); setReady(true); }
    }

    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user);
      router.refresh();
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
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
