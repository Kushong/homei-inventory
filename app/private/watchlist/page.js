'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import ImageUploader from '@/app/components/ImageUploader';

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

const PRESET_CATEGORIES = ['전자제품', '자동차'];
const VEHICLE_CATEGORIES = ['자동차'];
const FUEL_OPTIONS = ['가솔린', '디젤', '하이브리드', 'EV'];
const CUSTOM = '__custom__';

const emptyForm = {
  name: '',
  category: '전자제품',
  price: '',
  year: '',
  fuel_type: '',
  url: '',
  memo: '',
  image_url: '',
};

// 가격: 숫자만 추출 / "30,000$" 형태로 표시
function priceDigits(s) {
  return (s || '').replace(/[^\d]/g, '');
}
function commafy(digits) {
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}
function formatPrice(s) {
  const d = priceDigits(s);
  if (!d) return s || ''; // 숫자가 없으면 원본 그대로 (레거시 안전장치)
  return commafy(d) + '$';
}
function matchesQuery(it, q) {
  const hay = [
    it.name,
    it.category,
    it.fuel_type,
    it.url,
    it.memo,
    it.year != null ? String(it.year) : '',
    it.price || '',
    it.price ? formatPrice(it.price) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export default function WatchlistPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [activeCat, setActiveCat] = useState('전체');
  const [query, setQuery] = useState('');

  const [editing, setEditing] = useState(null); // null | 'new' | 항목객체
  const [form, setForm] = useState(emptyForm);
  const [customCat, setCustomCat] = useState('');

  // 드래그 정렬용
  const itemsRef = useRef([]);
  const dragIndex = useRef(null);
  const [overIndex, setOverIndex] = useState(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const loadItems = useCallback(
    async (uid) => {
      const { data, error: e } = await supabase
        .from('private_watchlist')
        .select('*')
        .eq('owner_id', uid)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (e) {
        setError(e.message);
        return [];
      }
      setItems(data || []);
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
      await loadItems(user.id);
      setLoading(false);
    })();
  }, [supabase, loadItems]);

  const categories = (() => {
    const set = new Set(PRESET_CATEGORIES);
    items.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set);
  })();

  const q = query.trim().toLowerCase();
  const byCat =
    activeCat === '전체' ? items : items.filter((it) => it.category === activeCat);
  const shown = q ? byCat.filter((it) => matchesQuery(it, q)) : byCat;

  const canDrag = activeCat === '전체' && !q;

  function isVehicle(cat) {
    return VEHICLE_CATEGORIES.includes(cat);
  }

  function openNew() {
    const initialCat =
      activeCat !== '전체' && categories.includes(activeCat) ? activeCat : '전자제품';
    setForm({ ...emptyForm, category: initialCat });
    setCustomCat('');
    setEditing('new');
    setError('');
  }

  function openEdit(item) {
    setForm({
      name: item.name || '',
      category: item.category || '전자제품',
      price: priceDigits(item.price),
      year: item.year != null ? String(item.year) : '',
      fuel_type: item.fuel_type || '',
      url: item.url || '',
      memo: item.memo || '',
      image_url: item.image_url || '',
    });
    setCustomCat('');
    setEditing(item);
    setError('');
  }

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setCustomCat('');
  }

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function onCategoryChange(val) {
    if (val === CUSTOM) {
      setField('category', CUSTOM);
    } else {
      setField('category', val);
      setCustomCat('');
    }
  }

  async function save() {
    if (busy || !userId) return;
    const name = form.name.trim();
    if (!name) {
      setError('이름을 입력해 주세요.');
      return;
    }
    let category = form.category;
    if (category === CUSTOM) {
      category = customCat.trim();
      if (!category) {
        setError('새 카테고리 이름을 입력해 주세요.');
        return;
      }
    }
    const vehicle = isVehicle(category);
    const yearVal = vehicle && form.year.trim() ? parseInt(form.year, 10) : null;
    const fuelVal = vehicle && form.fuel_type ? form.fuel_type : null;
    const priceStr = priceDigits(form.price); // 숫자만 저장

    const payload = {
      category,
      name,
      price: priceStr || null,
      year: Number.isFinite(yearVal) ? yearVal : null,
      fuel_type: fuelVal,
      url: form.url.trim() || null,
      image_url: form.image_url || null,
      memo: form.memo.trim() || null,
    };

    setBusy(true);
    setError('');
    try {
      if (editing === 'new') {
        const nextOrder = items.length
          ? Math.max.apply(null, items.map((x) => x.sort_order)) + 1
          : 0;
        const { data, error: e } = await supabase
          .from('private_watchlist')
          .insert({ owner_id: userId, sort_order: nextOrder, ...payload })
          .select()
          .single();
        if (e) throw e;
        setItems((arr) => arr.concat(data));
      } else {
        const { data, error: e } = await supabase
          .from('private_watchlist')
          .update(payload)
          .eq('id', editing.id)
          .select()
          .single();
        if (e) throw e;
        setItems((arr) => arr.map((x) => (x.id === data.id ? data : x)));
      }
      closeForm();
    } catch (err) {
      setError(err.message || '저장에 실패했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!confirm('이 항목을 삭제할까요?')) return;
    setError('');
    const prev = items;
    setItems((arr) => arr.filter((x) => x.id !== item.id));
    if (editing && editing !== 'new' && editing.id === item.id) closeForm();
    const { error: e } = await supabase
      .from('private_watchlist')
      .delete()
      .eq('id', item.id);
    if (e) {
      setError(e.message || '삭제에 실패했어요.');
      setItems(prev);
    }
  }

  // ---- 드래그 순서 변경 (전체 탭, 데스크톱 마우스) ----
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
    setItems((arr) => {
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
    const cur = itemsRef.current;
    const changed = [];
    cur.forEach((t, i) => {
      if (t.sort_order !== i) changed.push({ id: t.id, order: i });
    });
    if (!changed.length) return;
    setItems((arr) => arr.map((t, i) => ({ ...t, sort_order: i })));
    try {
      await Promise.all(
        changed.map((c) =>
          supabase.from('private_watchlist').update({ sort_order: c.order }).eq('id', c.id)
        )
      );
    } catch (err) {
      setError(err.message || '순서 저장에 실패했어요.');
      if (userId) loadItems(userId);
    }
  }

  const formVehicle = isVehicle(
    form.category === CUSTOM ? customCat.trim() : form.category
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: COL.ink, margin: '0 0 4px' }}>
        워칭리스트
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: COL.sub }}>
        관심 있는 물품을 모아두는 곳이에요. 전체 탭에서 손잡이(⠿)를 잡고 끌어 순서를 바꿀 수 있어요.
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

      {/* 필터 탭 + 검색 + 추가 버튼 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {['전체'].concat(categories).map((cat) => {
            const on = activeCat === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCat(cat)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  cursor: 'pointer',
                  border: on ? 'none' : '1px solid ' + COL.border,
                  background: on ? COL.ink : '#fff',
                  color: on ? '#fff' : COL.sub,
                  fontWeight: on ? 700 : 400,
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색"
            style={{
              width: 160,
              boxSizing: 'border-box',
              padding: '7px 28px 7px 12px',
              borderRadius: 20,
              border: '1px solid ' + COL.border,
              fontSize: 13,
              outline: 'none',
              color: COL.ink2,
              background: '#fff',
            }}
          />
          {query ? (
            <button
              type="button"
              title="지우기"
              onClick={() => setQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                border: 'none',
                background: 'transparent',
                color: COL.faint,
                fontSize: 13,
                lineHeight: 1,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              ✕
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={openNew}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: COL.ink,
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          + 새 항목
        </button>
      </div>

      {/* 등록 / 편집 폼 */}
      {editing ? (
        <div
          style={{
            marginBottom: 22,
            padding: 18,
            borderRadius: 12,
            border: '1px solid ' + COL.border,
            background: COL.bg,
            maxWidth: 640,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: COL.ink2, marginBottom: 14 }}>
            {editing === 'new' ? '새 항목 등록' : '항목 편집'}
          </div>

          <div style={{ marginBottom: 14 }}>
            <ImageUploader
              value={form.image_url}
              onChange={(u) => setField('image_url', u)}
              folder="watchlist"
              disabled={busy}
            />
          </div>

          <FieldRow label="이름">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="예: 기아 EV6"
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow label="카테고리">
            <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0 }}>
              <select
                value={form.category}
                onChange={(e) => onCategoryChange(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={CUSTOM}>+ 직접 입력</option>
              </select>
              {form.category === CUSTOM ? (
                <input
                  type="text"
                  value={customCat}
                  onChange={(e) => setCustomCat(e.target.value)}
                  placeholder="새 카테고리"
                  style={{ ...inputStyle, flex: 1 }}
                />
              ) : null}
            </div>
          </FieldRow>

          <FieldRow label="가격">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <input
                type="text"
                inputMode="numeric"
                value={commafy(form.price)}
                onChange={(e) => setField('price', priceDigits(e.target.value))}
                placeholder="예: 30000"
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontSize: 15, color: COL.sub, fontWeight: 600 }}>$</span>
            </div>
          </FieldRow>

          {formVehicle ? (
            <>
              <FieldRow label="연식">
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => setField('year', e.target.value)}
                  placeholder="예: 2024"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="연료">
                <select
                  value={form.fuel_type}
                  onChange={(e) => setField('fuel_type', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">선택 안 함</option>
                  {FUEL_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </FieldRow>
            </>
          ) : null}

          <FieldRow label="사이트">
            <input
              type="text"
              value={form.url}
              onChange={(e) => setField('url', e.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow label="메모">
            <textarea
              value={form.memo}
              onChange={(e) => setField('memo', e.target.value)}
              placeholder="자유 메모"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </FieldRow>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              style={{
                padding: '9px 20px',
                borderRadius: 8,
                border: 'none',
                background: busy ? '#d4d4d8' : COL.ink,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              {busy ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={busy}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: '1px solid ' + COL.border,
                background: '#fff',
                color: COL.sub,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            {editing !== 'new' ? (
              <button
                type="button"
                onClick={() => remove(editing)}
                disabled={busy}
                style={{
                  marginLeft: 'auto',
                  padding: '9px 16px',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                  background: '#fff',
                  color: COL.danger,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                삭제
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 리스트 */}
      {loading ? (
        <div style={{ padding: 16, fontSize: 13, color: COL.faint }}>불러오는 중…</div>
      ) : shown.length === 0 ? (
        <div
          style={{
            padding: 28,
            borderRadius: 12,
            border: '1px dashed ' + COL.border,
            background: COL.bg,
            fontSize: 14,
            color: COL.faint,
            textAlign: 'center',
            maxWidth: 760,
          }}
        >
          {q
            ? '검색 결과가 없어요.'
            : activeCat === '전체'
            ? '아직 등록된 물품이 없어요. "+ 새 항목"으로 추가하세요.'
            : '이 카테고리에 항목이 없어요.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 760 }}>
          {shown.map((item, index) => (
            <div
              key={item.id}
              draggable={canDrag}
              onDragStart={canDrag ? (e) => onDragStart(e, index) : undefined}
              onDragEnter={canDrag ? () => onDragEnter(index) : undefined}
              onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
              onDragEnd={canDrag ? onDragEnd : undefined}
              onClick={() => openEdit(item)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid ' + (overIndex === index && canDrag ? COL.accent : COL.border),
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              {canDrag ? (
                <span
                  title="끌어서 순서 변경"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    cursor: 'grab',
                    color: COL.faint,
                    fontSize: 16,
                    lineHeight: 1,
                    userSelect: 'none',
                    flexShrink: 0,
                  }}
                >
                  ⠿
                </span>
              ) : null}

              <div
                style={{
                  width: 48,
                  height: 48,
                  flexShrink: 0,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: COL.bg,
                  border: '1px solid ' + COL.border,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: 9, color: COL.faint }}>없음</span>
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: COL.ink2,
                    wordBreak: 'break-word',
                  }}
                >
                  {item.name}
                </div>
                <div style={{ fontSize: 12, color: COL.faint, marginTop: 2 }}>
                  {isVehicle(item.category) && (item.year || item.fuel_type)
                    ? [item.year ? item.year + '년식' : null, item.fuel_type]
                        .filter(Boolean)
                        .join(' · ')
                    : item.category}
                </div>
              </div>

              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 2,
                }}
              >
                {item.price ? (
                  <div style={{ fontSize: 14, fontWeight: 700, color: COL.ink }}>
                    {formatPrice(item.price)}
                  </div>
                ) : null}
                {item.url ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(item.url, '_blank', 'noopener,noreferrer');
                    }}
                    style={{
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: COL.accent,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    사이트 ↗
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                title="삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(item);
                }}
                style={{
                  flexShrink: 0,
                  border: 'none',
                  background: 'transparent',
                  color: COL.faint,
                  fontSize: 15,
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '4px 6px',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length > 0 ? (
        <div style={{ marginTop: 14, fontSize: 12, color: COL.faint }}>
          전체 {items.length}개
          {activeCat !== '전체' ? ' · ' + activeCat + ' ' + shown.length + '개' : ''}
        </div>
      ) : null}
    </div>
  );
}

const inputStyle = {
  flex: 1,
  boxSizing: 'border-box',
  width: '100%',
  padding: '9px 11px',
  borderRadius: 8,
  border: '1px solid ' + COL.border,
  fontSize: 14,
  outline: 'none',
  color: COL.ink2,
  background: '#fff',
};

function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
      <div
        style={{
          width: 62,
          flexShrink: 0,
          paddingTop: 9,
          fontSize: 13,
          color: COL.sub,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>{children}</div>
    </div>
  );
}
