'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// 유형 → direction/reason 매핑
const TYPES = [
  { key: '입고', dir: 'in',  direction: 'IN',  reason: 'PURCHASE', sign: '+' },
  { key: '판매', dir: 'out', direction: 'OUT', reason: 'SALE',     sign: '−' },
  { key: '샘플', dir: 'out', direction: 'OUT', reason: 'SAMPLE',   sign: '−' },
  { key: '반품', dir: 'in',  direction: 'IN',  reason: 'RETURN',   sign: '+' },
  { key: '교환', dir: 'out', special: true,    sign: '±' },
];

function today() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export default function TransactionForm({ productId, userId, otherProducts }) {
  const supabase = createClient();
  const router = useRouter();

  const [type, setType] = useState(TYPES[0]);
  const [date, setDate] = useState(today());
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  // 교환 전용
  const [swapId, setSwapId] = useState('');
  const [swapQty, setSwapQty] = useState('');

  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);

  const createdAt = new Date(`${date}T12:00:00`).toISOString();

  async function submit() {
    setErr(''); setOk('');
    const n = parseInt(qty, 10);
    if (!n || n <= 0) { setErr('수량을 1 이상으로 입력하세요.'); return; }

    setSaving(true);

    let payload;
    if (type.special) {
      // 교환: 나가는 상품(현재) OUT + 들어오는 대체 상품 IN, 같은 group_id로 묶음
      if (!swapId) { setErr('교환으로 들어올 대체 상품을 선택하세요.'); setSaving(false); return; }
      const sn = parseInt(swapQty, 10);
      if (!sn || sn <= 0) { setErr('대체 상품 수량을 1 이상으로 입력하세요.'); setSaving(false); return; }
      const group = crypto.randomUUID();
      payload = [
        { product_id: productId, direction: 'OUT', reason: 'EXCHANGE_OUT', quantity: n, exchange_group_id: group, note: note || null, created_by: userId, created_at: createdAt },
        { product_id: swapId,    direction: 'IN',  reason: 'EXCHANGE_IN',  quantity: sn, exchange_group_id: group, note: note || null, created_by: userId, created_at: createdAt },
      ];
    } else {
      payload = [{
        product_id: productId,
        direction: type.direction,
        reason: type.reason,
        quantity: n,
        note: note || null,
        created_by: userId,
        created_at: createdAt,
      }];
    }

    const { error } = await supabase.from('inventory_transactions').insert(payload);
    setSaving(false);

    if (error) {
      setErr('저장에 실패했습니다: ' + error.message);
      return;
    }
    setOk('거래가 등록되었습니다.');
    setQty(''); setNote(''); setSwapId(''); setSwapQty('');
    router.refresh();
    setTimeout(() => setOk(''), 2500);
  }

  return (
    <div>
      {err && <div className="form-error">{err}</div>}
      {ok && <div className="form-ok">{ok}</div>}

      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>유형 · Type</label>
      <div className="seg">
        {TYPES.map((t) => (
          <button
            key={t.key}
            className={`${type.key === t.key ? 'on dir-' + t.dir : ''}`}
            onClick={() => { setType(t); setErr(''); }}
            type="button"
          >
            <span>{t.key}</span>
            <span className="sign">{t.sign}</span>
          </button>
        ))}
      </div>
      <div className="hint">
        {type.special
          ? '교환: 이 상품이 나가고(−), 선택한 대체 상품이 들어옵니다(+).'
          : type.dir === 'in' ? '재고가 늘어납니다 (+).' : '재고가 줄어듭니다 (−).'}
      </div>

      <div className="row2">
        <div className="field">
          <label>일자 · Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{type.special ? '나가는 수량' : '수량 · Qty'}</label>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </div>
      </div>

      {type.special && (
        <div className="row2">
          <div className="field">
            <label>대체 상품 · In</label>
            <select className="filter" style={{ width: '100%', height: 44 }} value={swapId} onChange={(e) => setSwapId(e.target.value)}>
              <option value="">선택…</option>
              {otherProducts.map((p) => (
                <option key={p.product_id} value={p.product_id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>들어오는 수량</label>
            <input type="number" min="1" value={swapQty} onChange={(e) => setSwapQty(e.target.value)} placeholder="0" />
          </div>
        </div>
      )}

      <div className="field">
        <label>메모 · Note (선택)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 거래처명, 주문번호 등" />
      </div>

      <button className="btn" onClick={submit} disabled={saving} type="button">
        {saving ? '저장 중…' : '거래 등록'}
      </button>
    </div>
  );
}
