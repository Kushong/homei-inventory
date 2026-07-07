'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function stockBadge(qty, safety) {
  if (qty <= 0) return { cls: 'zero', label: '재고 없음' };
  if (qty <= safety) return { cls: 'warn', label: '부족' };
  return { cls: 'ok', label: '정상' };
}

function usd(n) {
  return '$' + Number(n || 0).toLocaleString('en-US');
}

function blankForm(nextSort) {
  return {
    id: null,
    option_name: '',
    sku: '',
    price: '',
    safety_stock: '',
    is_default: false,
    sort_order: nextSort,
    currentStock: 0,   // 편집 시작 시점의 실제 재고
    newStock: '',      // 사용자가 입력한 목표 재고
    tiers: [],         // [{ pack_qty, price }]
  };
}

export default function VariantManager({ productId, canEdit, userId, initialVariants }) {
  const supabase = createClient();
  const router = useRouter();

  const variants = initialVariants || [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState(''); // 재고 조정 경고(컨펌) 메시지

  function openAdd() {
    const nextSort = variants.length
      ? Math.max(...variants.map((v) => v.sort_order || 0)) + 1
      : 0;
    setForm(blankForm(nextSort));
    setErr(''); setWarn('');
    setOpen(true);
  }

  function openEdit(v) {
    setForm({
      id: v.id,
      option_name: v.option_name || '',
      sku: v.sku || '',
      price: v.price == null ? '' : String(v.price),
      safety_stock: v.safety_stock == null ? '' : String(v.safety_stock),
      is_default: !!v.is_default,
      sort_order: v.sort_order || 0,
      currentStock: v.stock_quantity || 0,
      newStock: String(v.stock_quantity || 0),
      tiers: (v.tiers || []).map((t) => ({
        pack_qty: String(t.pack_qty),
        price: String(t.price),
      })),
    });
    setErr(''); setWarn('');
    setOpen(true);
  }

  function setField(k, val) { setForm((f) => ({ ...f, [k]: val })); }

  function addTier() {
    setForm((f) => ({ ...f, tiers: [...f.tiers, { pack_qty: '', price: '' }] }));
  }
  function setTier(i, k, val) {
    setForm((f) => {
      const tiers = f.tiers.slice();
      tiers[i] = { ...tiers[i], [k]: val };
      return { ...f, tiers };
    });
  }
  function removeTier(i) {
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));
  }

  // 목표 재고 - 현재 재고 = 조정량
  function stockDelta() {
    const target = parseInt(form.newStock, 10);
    if (Number.isNaN(target)) return 0;
    return target - (form.currentStock || 0);
  }

  // 저장 버튼: 재고가 바뀌었으면 경고 컨펌부터
  function onSaveClick() {
    setErr('');
    if (!form.option_name.trim()) { setErr('옵션명을 입력하세요.'); return; }
    const d = stockDelta();
    if (form.id && d !== 0) {
      const target = parseInt(form.newStock, 10);
      setWarn(`현재고를 ${form.currentStock} → ${target} (으)로 ${d > 0 ? '늘립니다' : '줄입니다'}. ` +
        `이 변경은 "조정" 거래 ${d > 0 ? '+' : '−'}${Math.abs(d)} 로 이력에 영구 기록됩니다. 계속할까요?`);
      return;
    }
    doSave();
  }

  async function doSave() {
    setWarn('');
    const name = form.option_name.trim();

    const tiers = form.tiers
      .map((t) => ({ pack_qty: parseInt(t.pack_qty, 10), price: Number(t.price) }))
      .filter((t) => t.pack_qty >= 1 && !Number.isNaN(t.price));

    setSaving(true);

    const variantId = form.id || crypto.randomUUID();
    const payload = {
      id: variantId,
      product_id: productId,
      option_name: name,
      sku: form.sku.trim() || null,
      price: Number(form.price) || 0,
      safety_stock: parseInt(form.safety_stock, 10) || 0,
      is_default: form.is_default,
      sort_order: parseInt(form.sort_order, 10) || 0,
    };

    if (form.is_default) {
      const { error: e0 } = await supabase
        .from('product_variants').update({ is_default: false })
        .eq('product_id', productId).neq('id', variantId);
      if (e0) { setErr('기본옵션 갱신 실패: ' + e0.message); setSaving(false); return; }
    }

    let vErr;
    if (form.id) {
      const { id, product_id, ...upd } = payload;
      ({ error: vErr } = await supabase.from('product_variants').update(upd).eq('id', form.id));
    } else {
      ({ error: vErr } = await supabase.from('product_variants').insert(payload));
    }
    if (vErr) {
      setErr(vErr.code === '23505' ? '이미 존재하는 SKU입니다.' : '저장 실패: ' + vErr.message);
      setSaving(false); return;
    }

    // 세트가격: 전부 삭제 후 재삽입
    await supabase.from('variant_price_tiers').delete().eq('variant_id', variantId);
    if (tiers.length) {
      const rows = tiers.map((t) => ({
        id: crypto.randomUUID(), variant_id: variantId, pack_qty: t.pack_qty, price: t.price,
      }));
      const { error: tErr } = await supabase.from('variant_price_tiers').insert(rows);
      if (tErr) { setErr('세트가격 저장 실패: ' + tErr.message); setSaving(false); return; }
    }

    // 재고 조정: 목표-현재 차이만큼 '조정' 거래 기록 (늘리면 ADJUST+, 줄이면 OUT−)
    const d = stockDelta();
    const startStock = form.id ? (form.currentStock || 0) : 0;
    const target = parseInt(form.newStock, 10);
    if (!Number.isNaN(target) && d !== 0) {
      const { error: adjErr } = await supabase.from('inventory_transactions').insert({
        product_id: productId,
        variant_id: variantId,
        direction: d > 0 ? 'ADJUST' : 'OUT',
        reason: 'ADJUSTMENT',
        quantity: Math.abs(d),
        note: `재고 조정 (${startStock} → ${target})`,
        created_by: userId,
      });
      if (adjErr) { setErr('재고 조정 실패: ' + adjErr.message); setSaving(false); return; }
    }

    setSaving(false);
    setOpen(false);
    setForm(null);
    router.refresh();
  }

  async function remove(v) {
    if (variants.length <= 1) {
      alert('마지막 옵션은 삭제할 수 없습니다. 상품에는 최소 1개의 옵션이 필요합니다.');
      return;
    }
    const { count } = await supabase
      .from('inventory_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('variant_id', v.id);
    if (count && count > 0) {
      alert(`이 옵션에는 거래 이력이 ${count}건 있어 삭제할 수 없습니다. 이름을 수정해 계속 사용하세요.`);
      return;
    }
    if (!confirm(`"${v.option_name}" 옵션을 삭제할까요?`)) return;

    await supabase.from('variant_price_tiers').delete().eq('variant_id', v.id);
    const { error } = await supabase.from('product_variants').delete().eq('id', v.id);
    if (error) { alert('삭제 실패: ' + error.message); return; }

    if (v.is_default) {
      const left = variants.filter((x) => x.id !== v.id);
      if (left.length) {
        await supabase.from('product_variants').update({ is_default: true }).eq('id', left[0].id);
      }
    }
    router.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>옵션 · Options {variants.length > 0 && <span className="faint" style={{ fontWeight: 600 }}>({variants.length})</span>}</span>
        {canEdit && (
          <button className="chip brand" type="button" onClick={openAdd}>+ 옵션 추가</button>
        )}
      </div>

      <div className="table-scroll">
        <table style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>옵션</th>
              <th>SKU</th>
              <th className="r">단가</th>
              <th className="r">재고</th>
              <th>세트가격</th>
              {canEdit && <th className="r">관리</th>}
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const b = stockBadge(v.stock_quantity, v.safety_stock);
              const tierText = (v.tiers || []).length
                ? v.tiers.map((t) => `${t.pack_qty}개 ${usd(t.price)}`).join(' · ')
                : null;
              return (
                <tr key={v.id}>
                  <td>
                    <b>{v.option_name}</b>
                    {v.is_default && <span className="badge cat" style={{ marginLeft: 8 }}>기본</span>}
                  </td>
                  <td className="mono muted">{v.sku || <span className="faint">—</span>}</td>
                  <td className="r num">{usd(v.price)}</td>
                  <td className="r">
                    <span className="stock-cell">
                      <span className="stock-num num">{v.stock_quantity}</span>
                      <span className={`badge ${b.cls}`}>{b.label}</span>
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {tierText || <span className="faint">—</span>}
                  </td>
                  {canEdit && (
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="chip" type="button" onClick={() => openEdit(v)}>수정</button>
                      <button className="chip" type="button" onClick={() => remove(v)}
                        style={{ marginLeft: 6, color: 'var(--danger)' }}>삭제</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && form && (
        <div className="modal-overlay" onClick={() => !saving && setOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? '옵션 수정' : '옵션 추가'}</h2>
            <p className="sub">색상·사이즈처럼 재고가 갈리는 옵션을 등록합니다. 세트가격은 표시용이며 재고엔 영향이 없습니다.</p>

            {err && <div className="form-error">{err}</div>}

            <div className="field">
              <label>옵션명 · 예: 블랙 / L, 그린</label>
              <input value={form.option_name} onChange={(e) => setField('option_name', e.target.value)} placeholder="옵션 이름" disabled={!!warn} />
            </div>

            <div className="row2">
              <div className="field">
                <label>SKU (선택)</label>
                <input value={form.sku} onChange={(e) => setField('sku', e.target.value)} placeholder="예: HI-001-BK" disabled={!!warn} />
              </div>
              <div className="field">
                <label>단가 ($)</label>
                <input type="number" min="0" value={form.price} onChange={(e) => setField('price', e.target.value)} placeholder="0" disabled={!!warn} />
              </div>
            </div>

            <div className="row2">
              <div className="field">
                <label>안전재고</label>
                <input type="number" min="0" value={form.safety_stock} onChange={(e) => setField('safety_stock', e.target.value)} placeholder="0" disabled={!!warn} />
              </div>
              <div className="field">
                <label>{form.id ? '현재고 (조정)' : '초기 재고'}</label>
                <input type="number" value={form.newStock} onChange={(e) => setField('newStock', e.target.value)} placeholder="0" disabled={!!warn} />
              </div>
            </div>
            <div className="hint" style={{ margin: '-6px 0 12px' }}>
              {form.id
                ? '숫자를 바꾸면 차이만큼 "조정" 거래가 자동 기록됩니다(이력 보존).'
                : '0보다 크면 "조정" 거래로 초기 재고가 잡힙니다.'}
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_default}
                  onChange={(e) => setField('is_default', e.target.checked)}
                  disabled={!!warn}
                  style={{ width: 17, height: 17, accentColor: 'var(--brand)' }} />
                기본옵션으로 지정
              </label>
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>세트가격 (수량별 단가 · 표시용)</span>
                {!warn && <button className="chip" type="button" onClick={addTier}>+ 추가</button>}
              </label>
              {form.tiers.length === 0 && (
                <div className="hint" style={{ margin: '6px 0 0' }}>예: 2개 $13, 3개 $18 처럼 묶음 단가를 안내합니다.</div>
              )}
              {form.tiers.map((t, i) => (
                <div key={i} className="row2" style={{ marginTop: 8, gridTemplateColumns: '1fr 1fr auto', alignItems: 'center' }}>
                  <input type="number" min="1" value={t.pack_qty} onChange={(e) => setTier(i, 'pack_qty', e.target.value)} placeholder="수량 (개)" disabled={!!warn} />
                  <input type="number" min="0" value={t.price} onChange={(e) => setTier(i, 'price', e.target.value)} placeholder="단가 ($)" disabled={!!warn} />
                  <button className="chip" type="button" onClick={() => removeTier(i)} style={{ color: 'var(--danger)' }} disabled={!!warn}>×</button>
                </div>
              ))}
            </div>

            {warn ? (
              <>
                <div className="form-error" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>⚠ {warn}</div>
                <div className="modal-foot">
                  <button className="btn ghost" type="button" onClick={() => setWarn('')} disabled={saving}>취소</button>
                  <button className="btn" type="button" onClick={doSave} disabled={saving}
                    style={{ background: 'var(--warn)' }}>{saving ? '조정 중…' : '조정하고 저장'}</button>
                </div>
              </>
            ) : (
              <div className="modal-foot">
                <button className="btn ghost" type="button" onClick={() => setOpen(false)} disabled={saving}>취소</button>
                <button className="btn" type="button" onClick={onSaveClick} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
