'use client';

import { useEffect, useState, useCallback } from 'react';
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

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  }
  return d.toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' });
}

function previewText(body) {
  const t = (body || '').trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, 60) : '';
}

export default function NotesPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [sel, setSel] = useState(null); // note id | 'new' | null
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(
    async (uid) => {
      const { data, error: e } = await supabase
        .from('private_notes')
        .select('*')
        .eq('owner_id', uid)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      if (e) {
        setError(e.message);
        return [];
      }
      setNotes(data || []);
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
      await loadNotes(user.id);
      setLoading(false);
    })();
  }, [supabase, loadNotes]);

  function guardDirty() {
    if (!dirty) return true;
    return confirm('저장하지 않은 변경이 있어요. 버릴까요?');
  }

  function openNote(n) {
    if (!guardDirty()) return;
    setSel(n.id);
    setTitle(n.title || '');
    setBody(n.body || '');
    setDirty(false);
    setError('');
  }

  function newNote() {
    if (!guardDirty()) return;
    setSel('new');
    setTitle('');
    setBody('');
    setDirty(true);
    setError('');
  }

  function closeEditor() {
    if (!guardDirty()) return;
    setSel(null);
    setDirty(false);
  }

  async function save() {
    if (!userId) return;
    if (!title.trim() && !body.trim()) {
      setError('제목이나 내용을 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (sel === 'new') {
        const { data, error: e } = await supabase
          .from('private_notes')
          .insert({ owner_id: userId, title: title.trim(), body })
          .select()
          .single();
        if (e) throw e;
        await loadNotes(userId);
        setSel(data.id);
        setTitle(data.title || '');
        setBody(data.body || '');
      } else {
        const { data, error: e } = await supabase
          .from('private_notes')
          .update({ title: title.trim(), body })
          .eq('id', sel)
          .select()
          .single();
        if (e) throw e;
        await loadNotes(userId);
        setTitle(data.title || '');
        setBody(data.body || '');
      }
      setDirty(false);
    } catch (err) {
      setError(err.message || '저장에 실패했어요.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (sel === 'new') {
      setSel(null);
      setDirty(false);
      return;
    }
    if (!confirm('이 메모를 삭제할까요? 되돌릴 수 없어요.')) return;
    setSaving(true);
    setError('');
    try {
      const { error: e } = await supabase.from('private_notes').delete().eq('id', sel);
      if (e) throw e;
      await loadNotes(userId);
      setSel(null);
      setDirty(false);
    } catch (err) {
      setError(err.message || '삭제에 실패했어요.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(n) {
    setError('');
    try {
      const { error: e } = await supabase
        .from('private_notes')
        .update({ pinned: !n.pinned })
        .eq('id', n.id);
      if (e) throw e;
      await loadNotes(userId);
    } catch (err) {
      setError(err.message || '고정 변경에 실패했어요.');
    }
  }

  const status = saving ? '저장 중…' : dirty ? '수정됨 (저장 안 됨)' : sel && sel !== 'new' ? '저장됨' : '';

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: COL.ink, margin: '0 0 4px' }}>메모</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: COL.sub }}>
        어느 컴퓨터에서 로그인해도 여기 적어둔 메모가 그대로 있어요.
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

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ---- 목록 ---- */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: COL.faint }}>
              전체 {notes.length}개
            </span>
            <button
              type="button"
              onClick={newNote}
              style={{
                marginLeft: 'auto',
                padding: '7px 12px',
                borderRadius: 8,
                border: 'none',
                background: COL.ink,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + 새 메모
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 16, fontSize: 13, color: COL.faint }}>불러오는 중…</div>
          ) : notes.length === 0 ? (
            <div
              style={{
                padding: 20,
                borderRadius: 10,
                border: '1px dashed ' + COL.border,
                background: COL.bg,
                fontSize: 13,
                color: COL.faint,
                textAlign: 'center',
              }}
            >
              아직 메모가 없어요.
              <br />
              오른쪽 위 “새 메모”로 시작하세요.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {notes.map((n) => {
                const active = sel === n.id;
                return (
                  <div
                    key={n.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                      padding: '10px 10px 10px 12px',
                      borderRadius: 10,
                      border: '1px solid ' + (active ? COL.ink : COL.border),
                      background: active ? '#f4f4f5' : '#fff',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openNote(n)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: COL.ink2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {n.title ? n.title : '제목 없음'}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: COL.sub,
                          marginTop: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {previewText(n.body) || '내용 없음'}
                      </div>
                      <div style={{ fontSize: 11, color: COL.faint, marginTop: 4 }}>
                        {fmt(n.updated_at)}
                      </div>
                    </button>
                    <button
                      type="button"
                      title={n.pinned ? '고정 해제' : '고정'}
                      onClick={() => togglePin(n)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 15,
                        lineHeight: 1,
                        color: n.pinned ? '#f59e0b' : '#d4d4d8',
                        padding: '2px 2px',
                      }}
                    >
                      {n.pinned ? '★' : '☆'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- 편집기 ---- */}
        <div style={{ flex: 1, minWidth: 280 }}>
          {sel === null ? (
            <div
              style={{
                padding: 40,
                borderRadius: 12,
                border: '1px dashed ' + COL.border,
                background: COL.bg,
                textAlign: 'center',
                color: COL.faint,
                fontSize: 14,
              }}
            >
              왼쪽에서 메모를 선택하거나 “새 메모”를 눌러 시작하세요.
            </div>
          ) : (
            <div
              style={{
                borderRadius: 12,
                border: '1px solid ' + COL.border,
                background: '#fff',
                padding: 18,
              }}
            >
              <input
                type="text"
                value={title}
                placeholder="제목"
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: 'none',
                  outline: 'none',
                  fontSize: 18,
                  fontWeight: 800,
                  color: COL.ink,
                  padding: '2px 0 10px',
                  marginBottom: 8,
                  borderBottom: '1px solid ' + COL.border,
                }}
              />
              <textarea
                value={body}
                placeholder="내용을 입력하세요…"
                onChange={(e) => {
                  setBody(e.target.value);
                  setDirty(true);
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  minHeight: 360,
                  resize: 'vertical',
                  border: 'none',
                  outline: 'none',
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: COL.ink2,
                  fontFamily: 'inherit',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px solid ' + COL.border,
                }}
              >
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || (!dirty && sel !== 'new')}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: saving || (!dirty && sel !== 'new') ? '#d4d4d8' : COL.accent,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: saving || (!dirty && sel !== 'new') ? 'default' : 'pointer',
                  }}
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={saving}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 8,
                    border: '1px solid ' + COL.border,
                    background: '#fff',
                    color: COL.danger,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: saving ? 'default' : 'pointer',
                  }}
                >
                  {sel === 'new' ? '취소' : '삭제'}
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: COL.faint }}>{status}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
