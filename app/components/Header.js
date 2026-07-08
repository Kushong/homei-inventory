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

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      // ★ 콜백 안에서 곧바로 supabase 호출 시 auth 락 경합 → setTimeout으로 밖에서 실행
      setTimeout(() => {
        load(session?.user);
        router.refresh();
      }, 0);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await
