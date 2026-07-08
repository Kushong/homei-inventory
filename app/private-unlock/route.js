import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { PRIVATE_COOKIE, UNLOCK_HOURS, makeUnlockToken } from '@/lib/privateGate';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const password = body?.password;
  if (!password) {
    return NextResponse.json({ error: '비밀번호를 입력하세요.' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // super 확인
  const { data: prof } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.role !== 'super') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  // 비밀번호 재인증
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  // 통과 → 잠금 해제 쿠키 발급 (8시간)
  const expiry = Date.now() + UNLOCK_HOURS * 60 * 60 * 1000;
  const jar = await cookies();
  jar.set(PRIVATE_COOKIE, makeUnlockToken(expiry), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: UNLOCK_HOURS * 60 * 60,
  });

  return NextResponse.json({ ok: true });
}
