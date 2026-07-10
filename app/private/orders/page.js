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
  ok: '#16a34a',
};

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

const EMPTY = {
  productName: '',
  price: '',
  customerName: '',
  phone: '',
  pccc: '',
  zipcode: '',
  roadAddress: '',
  detailAddress: '',
  orderDate: todayStr(),
  trackingNumber: '',
};

function joinAddress(road, detail) {
  const r = (road || '').trim();
  const d = (detail || '').trim();
  if (r && d) return r + ' ' + d;
  return r || d;
}

function formatPriceInput(v) {
  const s = v || '';
  // 숫자·콤마 외 다른 문자가 있으면 자유입력으로 보고 그대로 둔다
  if (/[^0-9,]/.test(s)) return s;
  const digits = s.replace(/,/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
}

function buildMemo({ productName, price, customerName, phone, address, zipcode, pccc }) {
  const line1 = [productName, price].filter((v) => (v || '').trim() !== '').join(', ');
  const addrLine = address
    ? (zipcode ? address + ' (' + zipcode + ')' : address)
    : '';
  return [
    '* 카톡 주문',
    line1 ? line1 + ' 받았어요' : '받았어요',
    customerName,
    phone,
    addrLine,
    pccc,
  ]
    .filter((l) => (l || '').trim() !== '')
    .join('\n');
}

function sortOrders(arr) {
  return [...arr].sort((a, b) => {
    if (a.shipped !== b.shipped) return a.shipped ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function OrdersPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [memoDraft, setMemoDraft] = useState({});

  const loadOrders = useCallback(
    async (uid) => {
      const { data, error: e } = await supabase
        .from('private_orders')
        .select('*')
        .eq('owner_id', uid)
        .order('shipped', { ascending: true })
        .order('created_at', { ascending: false });
      if (e) {
        setError(e.message);
        return;
      }
      setOrders(sortOrders(data || []));
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
      await loadOrders(user.id);
      setLoading(false);
    })();
  }, [supabase, loadOrders]);

  function setF(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function openPostcode() {
    if (typeof window === 'undefined') return;
    const run = () => {
      new window.daum.Postcode({
        oncomplete: (data) => {
          setForm((f) => ({
            ...f,
            zipcode: data.zonecode || '',
            roadAddress: data.roadAddress || data.address || '',
          }));
        },
      }).open();
    };
    if (window.daum && window.daum.Postcode) {
      run();
    } else {
      const existing = document.getElementById('daum-postcode-script');
      if (existing) {
        existing.addEventListener('load', run, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = 'daum-postcode-script';
      script.src =
        'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.onload = run;
      script.onerror = () => setError('우편번호 검색 스크립트를 불러오지 못했어요.');
      document.body.appendChild(script);
    }
  }

  async function addOrder() {
    if (!userId || busy) return;
    const hasAny =
      form.productName.trim() ||
      form.customerName.trim() ||
      form.phone.trim() ||
      form.roadAddress.trim();
    if (!hasAny) {
      setError('제품명·이름·전화번호·주소 중 최소 하나는 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    const address = joinAddress(form.roadAddress, form.detailAddress);
    const memo = buildMemo({
      productName: form.productName,
      price: form.price,
      customerName: form.customerName,
      phone: form.phone,
      address,
      zipcode: form.zipcode,
      pccc: form.pccc,
    });
    try {
      const { data, error: e } = await supabase
        .from('private_orders')
        .insert({
          owner_id: userId,
          product_name: form.productName.trim(),
          price: form.price.trim(),
          customer_name: form.customerName.trim(),
          phone: form.phone.trim(),
          pccc: form.pccc.trim(),
          zipcode: form.zipcode.trim(),
          address,
          memo,
          order_date: form.orderDate || null,
          tracking_number: form.trackingNumber.trim(),
          shipped: false,
        })
        .select()
        .single();
      if (e) throw e;
      setOrders((arr) => sortOrders(arr.concat(data)));
      setForm({ ...EMPTY, orderDate: todayStr() });
    } catch (err) {
      setError(err.message || '주문 추가에 실패했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleShipped(item) {
    setError('');
    const next = !item.shipped;
    setOrders((arr) =>
      sortOrders(
        arr.map((x) =>
          x.id === item.id
            ? { ...x, shipped: next, shipped_at: next ? new Date().toISOString() : null }
            : x
        )
      )
    );
    const { error: e } = await supabase
      .from('private_orders')
      .update({ shipped: next, shipped_at: next ? new Date().toISOString() : null })
      .eq('id', item.id);
    if (e) {
      setError(e.message);
      await loadOrders(userId);
    }
  }

  async function deleteOrder(item) {
    if (!window.confirm('이 주문을 삭제할까요?')) return;
    setError('');
    const prev = orders;
    setOrders((arr) => arr.filter((x) => x.id !== item.id));
    const { error: e } = await supabase
      .from('private_orders')
      .delete()
      .eq('id', item.id);
    if (e) {
      setError(e.message);
      setOrders(prev);
    }
  }

  function memoValue(item) {
    return memoDraft[item.id] !== undefined ? memoDraft[item.id] : item.memo || '';
  }

  function onMemoChange(item, val) {
    setMemoDraft((d) => ({ ...d, [item.id]: val }));
  }

  async function saveMemo(item) {
    const val = memoDraft[item.id];
    if (val === undefined || val === item.memo) return;
    const { error: e } = await supabase
      .from('private_orders')
      .update({ memo: val })
      .eq('id', item.id);
    if (e) {
      setError(e.message);
      return;
    }
    setOrders((arr) => arr.map((x) => (x.id === item.id ? { ...x, memo: val } : x)));
    setMemoDraft((d) => {
      const n = { ...d };
      delete n[item.id];
      return n;
    });
  }

  async function updateTracking(item, val) {
    setOrders((arr) =>
      arr.map((x) => (x.id === item.id ? { ...x, tracking_number: val } : x))
    );
  }

  async function saveTracking(item) {
    const { error: e } = await supabase
      .from('private_orders')
      .update({ tracking_number: item.tracking_number || '' })
      .eq('id', item.id);
    if (e) setError(e.message);
  }

  async function copyMemo(item) {
    const text = memoValue(item);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1500);
    } catch {
      setError('복사에 실패했어요. 브라우저 권한을 확인해 주세요.');
    }
  }

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '1px solid ' + COL.border,
    borderRadius: 8,
    fontSize: 14,
    color: COL.ink,
    background: '#fff',
  };
  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: COL.sub,
    marginBottom: 4,
  };

  const pending = orders.filter((o) => !o.shipped).length;
  const done = orders.length - pending;

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COL.ink, margin: 0 }}>
          📦 개인주문
        </h1>
        <p style={{ fontSize: 13, color: COL.sub, margin: '6px 0 0' }}>
          미출고 {pending}건 · 출고완료 {done}건
        </p>
      </div>

      {/* 새 주문 입력 */}
      <div
        style={{
          border: '1px solid ' + COL.border,
          borderRadius: 12,
          background: '#fff',
          padding: 18,
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: COL.ink2, marginBottom: 14 }}>
          새 주문 추가
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={labelStyle}>제품명</label>
            <input
              style={inputStyle}
              value={form.productName}
              onChange={(e) => setF('productName', e.target.value)}
              placeholder="예: 무선이어폰"
            />
          </div>
          <div>
            <label style={labelStyle}>가격</label>
            <input
              style={inputStyle}
              value={form.price}
              onChange={(e) => setF('price', formatPriceInput(e.target.value))}
              placeholder="예: 89,000"
            />
          </div>
          <div>
            <label style={labelStyle}>이름</label>
            <input
              style={inputStyle}
              value={form.customerName}
              onChange={(e) => setF('customerName', e.target.value)}
              placeholder="예: 홍길동"
            />
          </div>
          <div>
            <label style={labelStyle}>전화번호</label>
            <input
              style={inputStyle}
              value={form.phone}
              onChange={(e) => setF('phone', e.target.value)}
              placeholder="예: 010-1234-5678"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>개인통관고유부호</label>
            <input
              style={inputStyle}
              value={form.pccc}
              onChange={(e) => setF('pccc', e.target.value)}
              placeholder="예: P123456789012"
            />
          </div>
          <div>
            <label style={labelStyle}>주문날짜</label>
            <input
              type="date"
              style={inputStyle}
              value={form.orderDate}
              onChange={(e) => setF('orderDate', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>송장번호</label>
            <input
              style={inputStyle}
              value={form.trackingNumber}
              onChange={(e) => setF('trackingNumber', e.target.value)}
              placeholder="나중에 입력 가능"
            />
          </div>
        </div>

        {/* 주소 */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>주소</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1, background: '#f4f4f5' }}
              value={form.zipcode}
              readOnly
              placeholder="우편번호"
            />
            <button
              type="button"
              onClick={openPostcode}
              style={{
                flexShrink: 0,
                padding: '8px 14px',
                border: '1px solid ' + COL.accent,
                borderRadius: 8,
                background: '#fff',
                color: COL.accent,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔍 주소 검색
            </button>
          </div>
          <input
            style={{ ...inputStyle, marginBottom: 8, background: '#f4f4f5' }}
            value={form.roadAddress}
            readOnly
            placeholder="검색으로 도로명주소 입력"
          />
          <input
            style={inputStyle}
            value={form.detailAddress}
            onChange={(e) => setF('detailAddress', e.target.value)}
            placeholder="상세주소 (동/호수 등)"
          />
        </div>

        {error ? (
          <div style={{ color: COL.danger, fontSize: 13, marginBottom: 10 }}>{error}</div>
        ) : null}

        <button
          type="button"
          onClick={addOrder}
          disabled={busy}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderRadius: 8,
            background: busy ? COL.faint : COL.accent,
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? '추가 중…' : '+ 주문 추가'}
        </button>
      </div>

      {/* 카드 목록 */}
      {loading ? (
        <div style={{ color: COL.sub, fontSize: 14 }}>불러오는 중…</div>
      ) : orders.length === 0 ? (
        <div style={{ color: COL.faint, fontSize: 14 }}>아직 주문이 없어요.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {orders.map((item) => (
            <div
              key={item.id}
              style={{
                border: '1px solid ' + COL.border,
                borderRadius: 12,
                background: '#fff',
                padding: 16,
                opacity: item.shipped ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: item.shipped ? COL.ok : COL.sub,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.shipped}
                    onChange={() => toggleShipped(item)}
                    style={{ width: 17, height: 17, cursor: 'pointer' }}
                  />
                  {item.shipped ? '출고완료' : '출고 체크'}
                </label>
                <div
                  style={{
                    marginLeft: 'auto',
                    fontSize: 15,
                    fontWeight: 700,
                    color: COL.ink,
                    textDecoration: item.shipped ? 'line-through' : 'none',
                  }}
                >
                  {item.product_name || '(제품명 없음)'}
                  {item.price ? (
                    <span style={{ color: COL.accent, marginLeft: 8, fontWeight: 700 }}>
                      {item.price}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => deleteOrder(item)}
                  style={{
                    flexShrink: 0,
                    padding: '4px 8px',
                    border: '1px solid ' + COL.border,
                    borderRadius: 6,
                    background: '#fff',
                    color: COL.danger,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  삭제
                </button>
              </div>

              <div style={{ fontSize: 13, color: COL.ink2, lineHeight: 1.7 }}>
                {item.customer_name ? <div>👤 {item.customer_name}</div> : null}
                {item.phone ? <div>📞 {item.phone}</div> : null}
                {item.address ? (
                  <div>
                    🏠 {item.address}
                    {item.zipcode ? ' (' + item.zipcode + ')' : ''}
                  </div>
                ) : null}
                {item.pccc ? <div>🔖 {item.pccc}</div> : null}
                {item.order_date ? <div>📅 {item.order_date}</div> : null}
              </div>

              {/* 송장번호 (카드에서 입력/수정) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <span style={{ fontSize: 13, color: COL.sub, flexShrink: 0 }}>🚚 송장</span>
                <input
                  value={item.tracking_number || ''}
                  onChange={(e) => updateTracking(item, e.target.value)}
                  onBlur={() => saveTracking(item)}
                  placeholder="송장번호 입력"
                  style={{
                    flex: 1,
                    boxSizing: 'border-box',
                    padding: '6px 10px',
                    border: '1px solid ' + COL.border,
                    borderRadius: 6,
                    fontSize: 13,
                    color: COL.ink,
                    background: '#fff',
                  }}
                />
              </div>

              {/* 주문메모 */}
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: COL.sub }}>
                    📋 주문메모
                  </span>
                  <button
                    type="button"
                    onClick={() => copyMemo(item)}
                    style={{
                      marginLeft: 'auto',
                      padding: '4px 10px',
                      border: '1px solid ' + (copiedId === item.id ? COL.ok : COL.accent),
                      borderRadius: 6,
                      background: '#fff',
                      color: copiedId === item.id ? COL.ok : COL.accent,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedId === item.id ? '✓ 복사됨' : '복사'}
                  </button>
                </div>
                <textarea
                  value={memoValue(item)}
                  onChange={(e) => onMemoChange(item, e.target.value)}
                  onBlur={() => saveMemo(item)}
                  rows={6}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    border: '1px solid ' + COL.border,
                    borderRadius: 8,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: COL.ink,
                    background: COL.bg,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
