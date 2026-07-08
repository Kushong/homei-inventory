'use client';

import { createBrowserClient } from '@supabase/ssr';

// 모듈 레벨 싱글톤: createClient()를 여러 컴포넌트에서 호출해도
// GoTrueClient 인스턴스는 하나만 유지 → iOS 사파리 Web Locks 경쟁/버벅임 방지
let _client = null;

export function createClient() {
  if (_client) return _client;

  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        // iOS 사파리는 navigator.locks(Web Locks)에서 락이 안 풀리고
        // 무한 대기하는 버그가 있어 로그인/세션조회가 "버버버벅" 멈춤.
        // 락을 우회해 콜백을 즉시 실행 → 데드락 제거.
        // 싱글톤이라 한 탭 내 인스턴스가 하나뿐이므로 안전.
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
    }
  );

  return _client;
}
