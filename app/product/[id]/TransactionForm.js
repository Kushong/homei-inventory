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

// 초기 선택 옵션: 1개면 그 옵션, 2개↑이면 빈 값(사용자 선택 강제)
function initialVariantId(variants) {
  if (!variants || variants.length === 0) return '';
  if (variants.length === 1) return variants[0].id;
  return '';
}

export default function TransactionForm({ productId, userId, otherProducts, variants = [] }) {
  const supabase = createClient();
  const router = useRouter();

  const hasVariants = variants.length > 0;
  const needChoice = variants.length >= 2; // 2개 이상이면 필수 선택

  const [type, setType] = useState(TYPES[0]);
  const [date, setDate] = useState(today());
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [variantId, setVariantId] = useState(() => initialVariantId(variants));
  const [tierKey, setTierKey] = useState(''); // 선택한 세트(pack_qty 문자열). ''=직접입력

  // 교환 전용
  const [swapId, setSwapId] = useState('');
  const [swapQty, setSwapQty] = useState('');

  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);

  const createdAt = new Date(`${date}T12:00:00`).toISOString();

  // 선택된 옵션(없으면 단일 옵션) 기준 세트가격
  const selectedVariant = variantId
    ? variants.find((v) => v.id === variantId)
    : (variants.length === 1 ? variants[0] : null);
  const tiers = (selectedVariant && selectedVariant.tiers) || [];
  const showSets = type.reason === 'SALE' && tiers.length > 0;

  function pickSet(t) {
    setTierKey(String(t.pack_qty));
    setQty(String(t.pack_qty));
    setErr('');
  }

  async function submit() {
    setErr(''); setOk('');
    const n = parseInt(qty, 10);
    if (!n || n <= 0) { setErr('수량을 1 이상으로 입력하세요.'); return; }

    // 옵션이 2개 이상이면 반드시 선택
    if (needChoice && !variantId) { setErr('옵션을 선택하세요.'); return; }

    setSaving(true);

    // variant_id: 선택값이 있으면 명시, 없으면 null → DB 트리거가 기본 옵션으로 채움
    const vId = variantId || null;

    // 세트 판매: 선택한 세트 라벨을 메모에 남김 (수량은 이미 pack_qty로 채워져 있음)
    let finalNote = note || null;
    if (showSets && tierKey) {
      const t = tiers.find((x) => String(x.pack_qty) === tierKey);
      if (t) {
        const label = `${t.pack_qty}개 세트 ($${Number(t.price).toLocaleString('en-US')})`;
        finalNote = note ? `${note} · ${label}` : label;
      }
    }

    let payload;
    if (type.special) {
      // 교환: 나가는 상품(현재) OUT + 들어오는 대체 상품 IN, 같은 group_id로 묶음
      if (!swapId) { setErr('교환으로 들어올 대체 상품을 선택하세요.'); setSaving(false); return; }
      const sn = parseInt(swapQty, 10);
      if (!sn || sn <= 0) { setErr('대체 상품 수량을 1 이상으로 입력하세요.'); setSaving(false); return; }
      const group = crypto.randomUUID();
      payload = [
        // 현재 상품 OUT → 선택한 옵션 명시
        { product_id: productId, variant_id: vId, direction: 'OUT', reason: 'EXCHANGE_OUT', quantity: n, exchange_group_id: group, note: note || null, created_by: userId, created_at: createdAt },
        // 대체 상품 IN → 해당 상품의 기본 옵션으로 트리거가 채움
        { product_id: swapId,    variant_id: null, direction: 'IN',  reason: 'EXCHANGE_IN',  quantity: sn, exchange_group_id: group, note: note || null, created_by: userId, created_at: createdAt },
      ];
    } else {
      payload = [{
        product_id: productId,
        variant_id: vId,
        direction: type.direction,
        reason: type.reason,
        quantity: n,
        note: finalNote,
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
    setQty(''); setNote(''); setSwapId(''); setSwapQty(''); setTierKey('');
    // 옵션 선택은 유지(같은 옵션 연속 등록 편의)
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
            onClick={() => { setType(t); setErr(''); setTierKey(''); }}
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

      {/* 옵션 선택: 2개 이상일 때만 노출(필수). 1개면 자동 배정되어 표시하지 않음 */}
      {needChoice && (
        <div className="field">
          <label>옵션 · Option <span style={{ color: '#e5484d' }}>*</span></label>
          <select
            className="filter"
            style={{ width: '100%', height: 44 }}
            value={variantId}
            onChange={(e) => { setVariantId(e.target.value); setTierKey(''); setErr(''); }}
          >
            <option value="">옵션 선택…</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}{typeof v.stock_quantity === 'number' ? ` · 재고 ${v.stock_quantity}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 세트 선택: 판매 유형이고 세트가격이 있을 때만 노출 */}
      {showSets && (
        <div className="field">
          <label>세트 · Set <span className="faint" style={{ fontWeight: 500 }}>(고르면 수량이 자동으로 채워집니다)</span></label>
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {tiers.map((t) => (
              <button
                key={t.pack_qty}
                type="button"
                className={tierKey === String(t.pack_qty) ? 'on dir-out' : ''}
                onClick={() => pickSet(t)}
              >
                <span>{t.pack_qty}개</span>
                <span className="sign">${Number(t.price).toLocaleString('en-US')}</span>
              </button>
            ))}
            <button
              type="button"
              className={tierKey === '' ? 'on' : ''}
              onClick={() => setTierKey('')}
            >
              <span>직접</span>
              <span className="sign">입력</span>
            </button>
          </div>
          <div className="hint">세트를 고른 만큼 재고가 빠집니다. 예: 3개 세트 → 재고 −3.</div>
        </div>
      )}

      <div className="row2">
        <div className="field">
          <label>일자 · Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{type.special ? '나가는 수량' : '수량 · Qty'}</label>
          <input type="number" min="1" value={qty} onChange={(e) => { setQty(e.target.value); setTierKey(''); }} placeholder="0" />
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
