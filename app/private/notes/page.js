'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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

function sortNotes(arr) {
  const pinned = arr
    .filter((n) => n.pinned)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const rest = arr
    .filter((n) => !n.pinned)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return [...pinned, ...rest];
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

  const notesRef = useRef([]);
  const dragIndex = useRef(null);
  const [overIndex, setOverIndex] = useState(null);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const loadNotes = useCallback(
    async (uid) => {
      const { data, error: e } = await supabase
        .from('private_notes')
        .select('*')
        .eq('owner_id', uid)
        .order('pinned', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('updated_at', { ascending: false });
      if (e) {
        setError(e.message);
        return [];
      }
      const sorted = sortNotes(data || []);
      setNotes(sorted);
      return sorted;
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
        // 새 메모는 안 핀된 그룹 맨 위로
        const rest = notes.filter((n) => !n.pinned);
        const minOrder = rest.length
          ? Math.min.apply(null, rest.map((n) => n.sort_order || 0))
          : 0;
        const { data, error: e } = await supabase
          .from('private_notes')
          .insert({ owner_id: userId, title: title.trim(), body, sort_order: minOrder - 1 })
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
