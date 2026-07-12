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
