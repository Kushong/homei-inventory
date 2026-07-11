import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 2025.6.25 도메인 변경: www.koreaexim.go.kr -> oapi.koreaexim.go.kr
const EXIM_URL = 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';

// 보여줄 통화 (표시 순서)
const WANTED = ['USD', 'EUR', 'JPY(100)', 'CNH', 'GBP'];
const FLAG = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  'JPY(100)': '🇯🇵',
  CNH: '🇨🇳',
  GBP: '🇬🇧',
};

function num(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// KST(UTC+9) 기준으로 offsetDays 만큼 이전 날짜의 YYYYMMDD와 요일 반환
function kstDate(offsetDays) {
  const t = new Date(Date.now() + 9 * 60 * 60 * 1000);
  t.setUTCDate(t.getUTCDate() - offsetDays);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return { str: `${y}${m}${d}`, dow: t.getUTCDay() }; // dow: 0=일 ... 6=토
}

async function fetchExim(dateStr, key) {
  const url = `${EXIM_URL}?authkey=${encodeURIComponent(key)}&searchdate=${dateStr}&data=AP01`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`EXIM HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  // 접근 제한: 로그인 + super (일일 호출한도 보호)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { data: prof } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.role !== 'super') {
    return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
  }

  const key = process.env.KOREAEXIM_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: 'KOREAEXIM_API_KEY 환경변수가 없습니다.' },
      { status: 500 }
    );
  }

  // 직전 영업일 fallback: 오늘부터 최대 8일 뒤로, 주말은 건너뛰며 호출
  let usedDate = null;
  let rows = [];
  let lastErr = null;
  for (let i = 0; i < 8; i++) {
    const { str, dow } = kstDate(i);
    if (dow === 0 || dow === 6) continue; // 주말 스킵

    let data;
    try {
      data = await fetchExim(str, key);
    } catch (e) {
      lastErr = e.message || String(e);
      continue; // 네트워크/타임아웃 → 이전 날짜 시도
    }

    if (data.length === 0) continue; // 휴일/미갱신 → 이전 영업일

    const r0 = data[0]?.result;
    if (r0 === 2) { lastErr = 'DATA코드 오류(result 2)'; break; }
    if (r0 === 3) { lastErr = '인증키 오류 또는 파기됨(result 3)'; break; }
    if (r0 === 4) { lastErr = '일일 호출한도 초과(result 4)'; break; }

    rows = data;
    usedDate = str;
    break;
  }

  if (!usedDate) {
    return NextResponse.json(
      { ok: false, error: lastErr ? `환율 조회 실패: ${lastErr}` : '최근 영업일 환율 데이터를 찾지 못했습니다.' },
      { status: 502 }
    );
  }

  const byUnit = {};
  for (const r of rows) {
    if (r && r.cur_unit) byUnit[r.cur_unit] = r;
  }

  const rates = WANTED.map((code) => {
    const r = byUnit[code];
    if (!r) return null;
    return {
      code,
      name: r.cur_nm || code,
      flag: FLAG[code] || '',
      base: num(r.deal_bas_r),
      buy: num(r.ttb),
      sell: num(r.tts),
      per: code.includes('(100)') ? 100 : 1,
    };
  }).filter(Boolean);

  const date = `${usedDate.slice(0, 4)}-${usedDate.slice(4, 6)}-${usedDate.slice(6, 8)}`;
  return NextResponse.json({ ok: true, date, rates });
}
