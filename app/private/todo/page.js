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

export default function TodoPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState(null);
  const [todos, setTodos] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: COL.ink, margin: '0 0 4px' }}>할 일</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: COL.sub }}>
        체크리스트예요. 손잡이(⠿)를 잡고 끌어 순서를 바꿀 수 있어요.
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, maxWidth: 620 }}>
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
            maxWidth: 620,
          }}
        >
          아직 할 일이 없어요. 위에 입력해서 추가하세요.
        </div>
      ) : (
        <div style={{ maxWidth: 620 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todos.map((item, index) => (
              <div
                key={item.id}
                draggable
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
                    cursor: 'grab',
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
                  style={{ width: 17, height: 17, cursor: 'pointer', flexShrink: 0 }}
                />
                <span
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
                <button
                  type="button"
                  title="삭제"
                  onClick={() => removeTodo(item)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: COL.faint,
                    fontSize: 15,
                    lineHeight: 1,
                    cursor: 'pointer',
                    padding: '4px 6px',
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: COL.faint }}>
            남은 항목 {remaining}개 · 전체 {todos.length}개
          </div>
        </div>
      )}
    </div>
  );
}
