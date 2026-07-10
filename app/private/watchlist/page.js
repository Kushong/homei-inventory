'use client';

import { useEffect, useState, useCallback } from 'react';
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

// 프리셋 카테고리 (여기에 저장된 값들과 합쳐 필터 탭을 만듦)
const PRESET_CATEGORIES = ['전자제품', '자동차'];

// 연식·연료 칸을 보여줄 카테고리
const VEHICLE_CATEGORIES = ['자동차'];

// 연료 선택지
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

export default function WatchlistPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [activeCat, setActiveCat] = useState('전체');

  // editing: null | 'new' | 항목객체
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [customCat, setCustomCat] = useState('');

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

  // 필터 탭용 카테고리 목록: 프리셋 ∪ 데이터에 있는 값
  const categories = (() => {
    const set = new Set(PRESET_CATEGORIES);
    items.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set);
  })();

  const shown =
    activeCat === '전체' ? items : items.filter((it) => it.category === activeCat);

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
      price: item.price || '',
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

    const payload = {
      category,
      name,
      price: form.price.trim() || null,
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

  const formVehicle = isVehicle(
    form.category === CUSTOM ? customCat.trim() : form.category
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: COL.ink, margin: '0 0 4px' }}>
        워칭리스트
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: COL.sub }}>
        관심 있는 물품을 모아두는 곳이에요. 사진은 붙여넣기·드래그·클릭으로 등록됩니다.
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

      {/* 필터 탭 + 추가 버튼 */}
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
            <input
              type="text"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              placeholder="예: $52,000"
              style={inputStyle}
            />
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

      {/* 카드 그리드 */}
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
            maxWidth: 640,
          }}
        >
          {activeCat === '전체'
            ? '아직 등록된 물품이 없어요. "+ 새 항목"으로 추가하세요.'
            : '이 카테고리에 항목이 없어요.'}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
            maxWidth: 760,
          }}
        >
          {shown.map((item) => (
            <div
              key={item.id}
              onClick={() => openEdit(item)}
              style={{
                display: 'flex',
                gap: 12,
                padding: 12,
                borderRadius: 12,
                border: '1px solid ' + COL.border,
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 88,
                  height: 88,
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
                  <span style={{ fontSize: 11, color: COL.faint }}>사진 없음</span>
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: COL.ink2,
                    marginBottom: 4,
                    wordBreak: 'break-word',
                  }}
                >
                  {item.name}
                </div>
                {isVehicle(item.category) && (item.year || item.fuel_type) ? (
                  <div style={{ fontSize: 12, color: COL.sub, marginBottom: 3 }}>
                    {[item.year ? item.year + '년식' : null, item.fuel_type]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: COL.faint, marginBottom: 3 }}>
                    {item.category}
                  </div>
                )}
                {item.price ? (
                  <div style={{ fontSize: 13, color: COL.ink, marginBottom: 3 }}>
                    {item.price}
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
                      marginTop: 2,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: COL.accent,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    사이트 열기 ↗
                  </button>
                ) : null}
              </div>
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
