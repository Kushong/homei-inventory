'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const COL = {
  border: '#e4e4e7',
  ink: '#18181b',
  ink2: '#27272a',
  sub: '#71717a',
  faint: '#a1a1aa',
  bg: '#fafafa',
  accent: '#2563eb',
  danger: '#dc2626',
};

/* ===================== 공휴일 캘린더 ===================== */

const CC = {
  KR: { label: '한국' },
  CN: { label: '중국' },
  KH: { label: '캄보디아' },
};

// 나라별 고정 마크: 한국=태극, 중국=빨간바탕 노란별, 캄보디아=앙코르와트(사원 이모지)
function CountryMark({ c, size = 14 }) {
  if (c === 'KR') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} style={{ display: 'block' }} aria-label="한국">
        <circle cx="16" cy="16" r="15.3" fill="#ffffff" stroke="#e4e4e7" strokeWidth="1" />
        <path d="M16 1 A15 15 0 0 1 16 31 A7.5 7.5 0 0 1 16 16 A7.5 7.5 0 0 0 16 1 Z" fill="#CD2E3A" />
        <path d="M16 31 A15 15 0 0 1 16 1 A7.5 7.5 0 0 1 16 16 A7.5 7.5 0 0 0 16 31 Z" fill="#0047A0" />
      </svg>
    );
  }
  if (c === 'CN') {
    return (
      <span
        aria-label="중국"
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: '#de2910',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.68),
          color: '#ffde00',
          lineHeight: 1,
        }}
      >
        ★
      </span>
    );
  }
  return (
    <span aria-label="캄보디아" style={{ fontSize: Math.round(size * 0.98), lineHeight: 1 }}>
      🛕
    </span>
  );
}

// 2026년 공휴일 (key: '월-일', 값: [{ c: 국가코드, n: 이름 }])
// 한국: 제헌절 부활·지방선거 반영 / 중국: 국무원 확정본 / 캄보디아: Sub-Decree No.167
const HOLIDAYS_2026 = {
  '1-1': [{ c: 'KR', n: '신정' }, { c: 'CN', n: '원단(신정)' }, { c: 'KH', n: '신년' }],
  '1-2': [{ c: 'CN', n: '신정 연휴' }],
  '1-3': [{ c: 'CN', n: '신정 연휴' }],
  '1-7': [{ c: 'KH', n: '대학살 종식 승리의 날' }],

  '2-15': [{ c: 'CN', n: '춘절 연휴' }],
  '2-16': [{ c: 'CN', n: '춘절 연휴' }, { c: 'KR', n: '설날' }],
  '2-17': [{ c: 'CN', n: '춘절' }, { c: 'KR', n: '설날' }],
  '2-18': [{ c: 'CN', n: '춘절 연휴' }, { c: 'KR', n: '설날' }],
  '2-19': [{ c: 'CN', n: '춘절 연휴' }],
  '2-20': [{ c: 'CN', n: '춘절 연휴' }],
  '2-21': [{ c: 'CN', n: '춘절 연휴' }],
  '2-22': [{ c: 'CN', n: '춘절 연휴' }],
  '2-23': [{ c: 'CN', n: '춘절 연휴' }],

  '3-1': [{ c: 'KR', n: '삼일절' }],
  '3-2': [{ c: 'KR', n: '대체공휴일(삼일절)' }],
  '3-8': [{ c: 'KH', n: '세계 여성의 날' }],

  '4-4': [{ c: 'CN', n: '청명절' }],
  '4-5': [{ c: 'CN', n: '청명절 연휴' }],
  '4-6': [{ c: 'CN', n: '청명절 연휴' }],
  '4-14': [{ c: 'KH', n: '크메르 설날' }],
  '4-15': [{ c: 'KH', n: '크메르 설날' }],
  '4-16': [{ c: 'KH', n: '크메르 설날' }],

  '5-1': [{ c: 'KR', n: '근로자의 날' }, { c: 'CN', n: '노동절' }, { c: 'KH', n: '노동절·부처님오신날' }],
  '5-2': [{ c: 'CN', n: '노동절 연휴' }],
  '5-3': [{ c: 'CN', n: '노동절 연휴' }],
  '5-4': [{ c: 'CN', n: '노동절 연휴' }],
  '5-5': [{ c: 'KR', n: '어린이날' }, { c: 'CN', n: '노동절 연휴' }, { c: 'KH', n: '왕실 경작 의식' }],
  '5-14': [{ c: 'KH', n: '국왕(시하모니) 탄신일' }],
  '5-24': [{ c: 'KR', n: '부처님오신날' }],
  '5-25': [{ c: 'KR', n: '대체공휴일(부처님오신날)' }],

  '6-3': [{ c: 'KR', n: '지방선거일' }],
  '6-6': [{ c: 'KR', n: '현충일' }],
  '6-18': [{ c: 'KH', n: '태후 탄신일' }],
  '6-19': [{ c: 'CN', n: '단오절' }],
  '6-20': [{ c: 'CN', n: '단오절 연휴' }],
  '6-21': [{ c: 'CN', n: '단오절 연휴' }],

  '7-17': [{ c: 'KR', n: '제헌절' }],

  '8-15': [{ c: 'KR', n: '광복절' }],
  '8-17': [{ c: 'KR', n: '대체공휴일(광복절)' }],

  '9-24': [{ c: 'KR', n: '추석' }, { c: 'KH', n: '제헌절' }],
  '9-25': [{ c: 'KR', n: '추석' }, { c: 'CN', n: '중추절' }],
  '9-26': [{ c: 'KR', n: '추석' }, { c: 'CN', n: '중추절 연휴' }],
  '9-27': [{ c: 'CN', n: '중추절 연휴' }],

  '10-1': [{ c: 'CN', n: '국경절' }],
  '10-2': [{ c: 'CN', n: '국경절 연휴' }],
  '10-3': [{ c: 'KR', n: '개천절' }, { c: 'CN', n: '국경절 연휴' }],
  '10-4': [{ c: 'CN', n: '국경절 연휴' }],
  '10-5': [{ c: 'CN', n: '국경절 연휴' }],
  '10-6': [{ c: 'CN', n: '국경절 연휴' }],
  '10-7': [{ c: 'CN', n: '국경절 연휴' }],
  '10-9': [{ c: 'KR', n: '한글날' }],
  '10-10': [{ c: 'KH', n: '프춤번' }],
  '10-11': [{ c: 'KH', n: '프춤번' }],
  '10-12': [{ c: 'KH', n: '프춤번' }],
  '10-15': [{ c: 'KH', n: '선왕(시아누크) 추모일' }],

  '11-9': [{ c: 'KH', n: '독립기념일' }],
  '11-23': [{ c: 'KH', n: '물축제' }],
  '11-24': [{ c: 'KH', n: '물축제' }],
  '11-25': [{ c: 'KH', n: '물축제' }],

  '12-10': [{ c: 'KH', n: '세계 인권의 날' }],
  '12-25': [{ c: 'KR', n: '성탄절' }],
};

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const ORDER = ['KR', 'CN', 'KH'];

function HolidayCalendar() {
  const now = new Date();
  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const [ym, setYm] = useState({ y: today.y, m: today.m });

  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const startDow = new Date(ym.y, ym.m, 1).getDay();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isY2026 = ym.y === 2026;

  function holidaysFor(d) {
    if (!isY2026 || !d) return [];
    return HOLIDAYS_2026[ym.m + 1 + '-' + d] || [];
  }

  function shift(delta) {
    setYm((s) => {
      const m = s.m + delta;
      if (m < 0) return { y: s.y - 1, m: 11 };
      if (m > 11) return { y: s.y + 1, m: 0 };
      return { y: s.y, m };
    });
  }

  const monthList = [];
  if (isY2026) {
    for (let d = 1; d <= daysInMonth; d++) {
      const hs = HOLIDAYS_2026[ym.m + 1 + '-' + d];
      if (hs) hs.forEach((h) => monthList.push({ d, dow: new Date(ym.y, ym.m, d).getDay(), c: h.c, n: h.n }));
    }
  }

  const navBtn = {
    border: '1px solid ' + COL.border,
    background: '#fff',
    borderRadius: 8,
    width: 30,
    height: 30,
    fontSize: 15,
    lineHeight: 1,
    cursor: 'pointer',
    color: COL.ink2,
  };

  return (
    <div
      style={{
        border: '1px solid ' + COL.border,
        borderRadius: 14,
        background: '#fff',
        padding: 16,
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: COL.ink }}>
          {ym.y}년 {ym.m + 1}월
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" title="이전 달" onClick={() => shift(-1)} style={navBtn}>
            ‹
          </button>
          <button
            type="button"
            onClick={() => setYm({ y: today.y, m: today.m })}
            style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 700 }}
          >
            오늘
          </button>
          <button type="button" title="다음 달" onClick={() => shift(1)} style={navBtn}>
            ›
          </button>
        </div>
      </div>

      {/* 범례 */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 11, color: COL.sub, alignItems: 'center', flexWrap: 'wrap' }}>
        {ORDER.map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <CountryMark c={k} size={14} />
            {CC[k].label}
          </span>
        ))}
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {WD.map((w, i) => (
          <div
            key={w}
            style={{
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 0',
              color: i === 0 ? COL.danger : i === 6 ? COL.accent : COL.faint,
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 (휴일: 나라별 마크 표시) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          const dow = i % 7;
          const hs = holidaysFor(d);
          const isToday = isY2026 && ym.m === today.m && d === today.d && ym.y === today.y;
          const isHoliday = hs.length > 0;
          const numColor = !d
            ? 'transparent'
            : isHoliday || dow === 0
            ? COL.danger
            : dow === 6
            ? COL.accent
            : COL.ink2;
          const seen = [];
          hs.forEach((h) => {
            if (seen.indexOf(h.c) === -1) seen.push(h.c);
          });
          const marks = ORDER.filter((c) => seen.indexOf(c) !== -1);
          return (
            <div
              key={i}
              style={{
                minHeight: 44,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                paddingTop: 4,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: isToday ? 800 : isHoliday ? 700 : 500,
                  color: numColor,
                  background: isToday ? '#eff6ff' : 'transparent',
                  border: isToday ? '2px solid ' + COL.accent : '2px solid transparent',
                  boxSizing: 'border-box',
                }}
              >
                {d || ''}
              </span>
              <span style={{ display: 'flex', gap: 2, marginTop: 3, height: 15, alignItems: 'center' }}>
                {marks.map((c) => (
                  <CountryMark key={c} c={c} size={14} />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      {/* 이달의 휴일 목록 */}
      <div style={{ marginTop: 12, borderTop: '1px solid ' + COL.border, paddingTop: 10 }}>
        {!isY2026 ? (
          <div style={{ fontSize: 12, color: COL.faint }}>휴일 표시는 2026년만 지원해요.</div>
        ) : monthList.length === 0 ? (
          <div style={{ fontSize: 12, color: COL.faint }}>이번 달 공휴일이 없어요.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {monthList.map((h, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
                  <CountryMark c={h.c} size={14} />
                </span>
                <span style={{ color: COL.sub, width: 52, flexShrink: 0 }}>
                  {ym.m + 1}/{h.d} ({WD[h.dow]})
                </span>
                <span style={{ color: COL.ink2 }}>{h.n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== 할 일 페이지 ===================== */

export default function TodoPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState(null);
  const [todos, setTodos] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const todosRef = useRef([]);
  const dragIndex = useRef(null);
  const [overIndex, setOverIndex] = useState(null);

  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  const loadTodos = useCallback(
    async (uid) => {
      const { data, error: e } = await supabase
        .from('private_todos')
        .select('*')
        .eq('owner_id', uid)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (e) {
        setError(e.message);
        return [];
      }
      setTodos(data || []);
      return data || [];
    },
    [supabase]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('세션이 없습니다. 다시 로그인해 주세요.');
        setLoading(false);
        return;
      }
      setUserId(user.id);
      await loadTodos(user.id);
      setLoading(false);
    })();
  }, [supabase, loadTodos]);

  async function addTodo() {
    const t = newTitle.trim();
    if (!t || !userId || busy) return;
    setBusy(true);
    setError('');
    const nextOrder = todos.length
      ? Math.max.apply(null, todos.map((x) => x.sort_order)) + 1
      : 0;
    try {
      const { data, error: e } = await supabase
        .from('private_todos')
        .insert({ owner_id: userId, title: t, sort_order: nextOrder })
        .select()
        .single();
      if (e) throw e;
      setTodos((arr) => arr.concat(data));
      setNewTitle('');
    } catch (err) {
      setError(err.message || '추가에 실패했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(item) {
    setError('');
    setTodos((arr) => arr.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)));
    const { error: e } = await supabase
      .from('private_todos')
      .update({ done: !item.done })
      .eq('id', item.id);
    if (e) {
      setError(e.message || '변경에 실패했어요.');
      setTodos((arr) => arr.map((x) => (x.id === item.id ? { ...x, done: item.done } : x)));
    }
  }

  async function removeTodo(item) {
    if (!confirm('이 항목을 삭제할까요?')) return;
    setError('');
    const prev = todos;
    setTodos((arr) => arr.filter((x) => x.id !== item.id));
    const { error: e } = await supabase.from('private_todos').delete().eq('id', item.id);
    if (e) {
      setError(e.message || '삭제에 실패했어요.');
      setTodos(prev);
    }
  }

  // ---- 편집 ----
  function startEdit(item) {
    setError('');
    setEditingId(item.id);
    setEditText(item.title);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  async function saveEdit(item) {
    const t = editText.trim();
    if (!t) {
      cancelEdit();
      return;
    }
    if (t === item.title) {
      cancelEdit();
      return;
    }
    setError('');
    const prev = todos;
    setTodos((arr) => arr.map((x) => (x.id === item.id ? { ...x, title: t } : x)));
    setEditingId(null);
    setEditText('');
    const { error: e } = await supabase
      .from('private_todos')
      .update({ title: t })
      .eq('id', item.id);
    if (e) {
      setError(e.message || '수정에 실패했어요.');
      setTodos(prev);
    }
  }

  // ---- 드래그 순서 변경 (데스크톱 마우스) ----
  function onDragStart(e, index) {
    dragIndex.current = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', String(index));
      } catch (_) {}
    }
  }

  function onDragEnter(index) {
    const from = dragIndex.current;
    if (from === null || from === index) {
      setOverIndex(index);
      return;
    }
    setTodos((arr) => {
      const next = arr.slice();
      const moved = next.splice(from, 1)[0];
      next.splice(index, 0, moved);
      return next;
    });
    dragIndex.current = index;
    setOverIndex(index);
  }

  async function onDragEnd() {
    dragIndex.current = null;
    setOverIndex(null);
    await persistOrder();
  }

  async function persistOrder() {
    const cur = todosRef.current;
    const changed = [];
    cur.forEach((t, i) => {
      if (t.sort_order !== i) changed.push({ id: t.id, order: i });
    });
    if (!changed.length) return;
    setTodos((arr) => arr.map((t, i) => ({ ...t, sort_order: i })));
    try {
      await Promise.all(
        changed.map((c) =>
          supabase.from('private_todos').update({ sort_order: c.order }).eq('id', c.id)
        )
      );
    } catch (err) {
      setError(err.message || '순서 저장에 실패했어요.');
      if (userId) loadTodos(userId);
    }
  }

  const remaining = todos.filter((t) => !t.done).length;

  const iconBtn = {
    border: 'none',
    background: 'transparent',
    color: COL.faint,
    fontSize: 15,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '4px 6px',
    flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* 좌: 할 일 */}
      <div style={{ flex: '1 1 520px', minWidth: 0, maxWidth: 620 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COL.ink, margin: '0 0 4px' }}>할 일</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: COL.sub }}>
          체크리스트예요. 손잡이(⠿)를 잡고 끌어 순서를 바꾸고, 연필(✎)로 내용을 고칠 수 있어요.
        </p>

        {error ? (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: COL.danger,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        {/* 추가 바 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input
            type="text"
            value={newTitle}
            placeholder="할 일을 입력하고 Enter"
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTodo();
            }}
            style={{
              flex: 1,
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid ' + COL.border,
              fontSize: 14,
              outline: 'none',
              color: COL.ink2,
            }}
          />
          <button
            type="button"
            onClick={addTodo}
            disabled={busy || !newTitle.trim()}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: busy || !newTitle.trim() ? '#d4d4d8' : COL.ink,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: busy || !newTitle.trim() ? 'default' : 'pointer',
            }}
          >
            추가
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 16, fontSize: 13, color: COL.faint }}>불러오는 중…</div>
        ) : todos.length === 0 ? (
          <div
            style={{
              padding: 28,
              borderRadius: 12,
              border: '1px dashed ' + COL.border,
              background: COL.bg,
              fontSize: 14,
              color: COL.faint,
              textAlign: 'center',
            }}
          >
            아직 할 일이 없어요. 위에 입력해서 추가하세요.
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todos.map((item, index) => {
                const editing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    draggable={!editing}
                    onDragStart={(e) => onDragStart(e, index)}
                    onDragEnter={() => onDragEnter(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={onDragEnd}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid ' + (overIndex === index ? COL.accent : COL.border),
                      background: '#fff',
                    }}
                  >
                    <span
                      title="끌어서 순서 변경"
                      style={{
                        cursor: editing ? 'default' : 'grab',
                        color: COL.faint,
                        fontSize: 16,
                        lineHeight: 1,
                        userSelect: 'none',
                      }}
                    >
                      ⠿
                    </span>
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleDone(item)}
                      disabled={editing}
                      style={{ width: 17, height: 17, cursor: editing ? 'default' : 'pointer', flexShrink: 0 }}
                    />

                    {editing ? (
                      <input
                        type="text"
                        value={editText}
                        autoFocus
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(item);
                          else if (e.key === 'Escape') cancelEdit();
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          boxSizing: 'border-box',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: '1px solid ' + COL.accent,
                          fontSize: 14,
                          outline: 'none',
                          color: COL.ink2,
                        }}
                      />
                    ) : (
                      <span
                        onDoubleClick={() => startEdit(item)}
                        title="더블클릭하면 편집"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14,
                          color: item.done ? COL.faint : COL.ink2,
                          textDecoration: item.done ? 'line-through' : 'none',
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.title}
                      </span>
                    )}

                    {editing ? (
                      <>
                        <button
                          type="button"
                          title="저장"
                          onClick={() => saveEdit(item)}
                          style={{ ...iconBtn, color: COL.accent, fontWeight: 700 }}
                        >
                          저장
                        </button>
                        <button type="button" title="취소" onClick={cancelEdit} style={iconBtn}>
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" title="편집" onClick={() => startEdit(item)} style={iconBtn}>
                          ✎
                        </button>
                        <button type="button" title="삭제" onClick={() => removeTodo(item)} style={iconBtn}>
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: COL.faint }}>
              남은 항목 {remaining}개 · 전체 {todos.length}개
            </div>
          </div>
        )}
      </div>

      {/* 우: 캘린더 */}
      <div style={{ flex: '0 1 340px', minWidth: 300, width: '100%', maxWidth: 380 }}>
        <HolidayCalendar />
      </div>
    </div>
  );
}
