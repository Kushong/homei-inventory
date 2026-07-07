'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ImageUploader from './components/ImageUploader';

function stockBadge(qty, safety) {
  if (qty <= 0) return { cls: 'zero', label: '재고 없음' };
  if (qty <= safety) return { cls: 'warn', label: '부족' };
  return { cls: 'ok', label: '정상' };
}

function usd(n) {
  const v = Number(n || 0);
  return '$' + v.toLocaleString('en-US');
}

// SKU 자동 생성: 기존 HI-### 중 최대 번호 +1 (3자리 0채움)
function genSku(products) {
  const nums = (products || []).map((p) => {
    const m = /^HI-(\d+)$/.exec(p.sku || '');
    return m ? parseInt(m[1], 10) : 0;
  });
  const next = (nums.length ? Math.max(0, ...nums) : 0) + 1;
  return 'HI-' + String(next).padStart(3, '0');
}

export default function Dashboard({ products, variants, stats, categories, isSuper, userId }) {
  const router = useRouter();
  const supabase = createClient();

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');

  // 선택 삭제
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  // 옵션(variant)별 재고: product_id -> [variant...]
  const variantsByProduct = useMemo(() => {
    const m = {};
    for (const v of variants || []) {
      if (!m[v.product_id]) m[v.product_id] = [];
      m[v.product_id].push(v);
    }
    return m;
  }, [variants]);

  // 행 펼치기 상태
  const [expanded, setExpanded] = useState(() => new Set());
  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // 상품 등록 모달
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fErr, setFErr] = useState('');
  const [form, setForm] = useState({
    sku: '', name: '', category: '', price: '', safety: '', imageUrl: '', initStock: '',
  });

  // 필터용 카테고리 이름 목록 (상품에서 추출)
  const catNames = useMemo(
    () => [...new Set(products.map((p) => p.category_name).filter(Boolean))].sort(),
    [products]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat && p.category_name !== cat) return false;
      if (status) {
        const b = stockBadge(p.stock_quantity, p.safety_stock).cls;
        if (status === 'ok' && b !== 'ok') return false;
        if (status === 'warn' && b !== 'warn') return false;
        if (status === 'zero' && b !== 'zero') return false;
      }
      if (!term) return true;
      return (
        (p.name || '').toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term) ||
        (p.category_name || '').toLowerCase().includes(term)
      );
    });
  }, [products, q, cat, status]);

  const allChecked = rows.length > 0 && rows.every((p) => selected.has(p.product_id));

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (rows.every((p) => prev.has(p.product_id))) {
        const next = new Set(prev);
        rows.forEach((p) => next.delete(p.product_id));
        return next;
      }
      const next = new Set(prev);
      rows.forEach((p) => next.add(p.product_id));
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `선택한 상품 ${ids.length}개를 삭제합니다.\n` +
      `이 상품들의 거래 이력도 함께 삭제되며, 되돌릴 수 없습니다.\n\n계속할까요?`
    );
    if (!ok) return;

    setDeleting(true);
    const { error } = await supabase.from('products').delete().in('id', ids);
    setDeleting(false);

    if (error) {
      alert('삭제 실패: ' + error.message);
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  function upd(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // 카테고리 이름 → id (없으면 새로 생성)
  async function resolveCategoryId(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const found = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (found) return found.id;
    const id = crypto.randomUUID();
    const { error } = await supabase.from('categories').insert({ id, name: trimmed });
    if (error) throw error;
    return id;
  }

  async function createProduct() {
    setFErr('');
    if (!form.name.trim()) { setFErr('상품명을 입력하세요.'); return; }

    setSaving(true);
    try {
      const categoryId = await resolveCategoryId(form.category);
      const productId = crypto.randomUUID();
      const sku = form.sku.trim() || genSku(products);

      const { error } = await supabase.from('products').insert({
        id: productId,
        sku,
        name: form.name.trim(),
        category_id: categoryId,
        price: Number(form.price) || 0,
        safety_stock: parseInt(form.safety, 10) || 0,
        image_url: form.imageUrl.trim() || null,
      });
      if (error) {
        setFErr(
          error.code === '23505'
            ? '이미 존재하는 SKU입니다. 다른 코드를 사용하세요.'
            : '등록 실패: ' + error.message
        );
        setSaving(false);
        return;
      }

      // 초기 재고가 있으면 '조정(+)' 거래로 기록 → 현재고 반영
      const init = parseInt(form.initStock, 10);
      if (init > 0) {
        await supabase.from('inventory_transactions').insert({
          product_id: productId,
          direction: 'ADJUST',
          reason: 'ADJUSTMENT',
          quantity: init,
          note: '초기 재고',
          created_by: userId,
        });
      }

      setSaving(false);
      setShowAdd(false);
      setForm({ sku: '', name: '', category: '', price: '', safety: '', imageUrl: '', initStock: '' });
      router.refresh();
    } catch (e) {
      setFErr('오류: ' + (e?.message || String(e)));
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">재고 현황 <span className="faint" style={{ fontWeight: 700, fontSize: 18 }}>Inventory</span></h1>
          <p className="page-sub">실시간 입·출고 기준으로 자동 집계됩니다. 상품을 눌러 거래를 등록하세요.</p>
        </div>
        {isSuper && (
          <button className="btn sm" type="button" onClick={() => { setFErr(''); setShowAdd(true); }}>
            ＋ 새 상품 등록
          </button>
        )}
      </div>

      {/* 통계 카드 */}
      <div className="stats">
        <div className="stat">
          <div className="label">전체 상품 · Products</div>
          <div className="value num">{stats.total_products}<span className="unit">개</span></div>
        </div>
        <div className="stat accent-warn">
          <div className="label">재고 부족 · Low stock</div>
          <div className="value num">{stats.low_stock_count}<span className="unit">건</span></div>
        </div>
        <div className="stat">
          <div className="label">오늘 입고 · In today</div>
          <div className="flow">
            <div><span className="in num">+{stats.today_in}</span><small>입고</small></div>
          </div>
        </div>
        <div className="stat">
          <div className="label">오늘 출고 · Out today</div>
          <div className="flow">
            <div><span className="out num">−{stats.today_out}</span><small>출고</small></div>
          </div>
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div className="toolbar">
        <div className="search">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            placeholder="상품명 · SKU · 카테고리 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="filter" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">전체 카테고리</option>
          {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">전체 상태</option>
          <option value="ok">정상</option>
          <option value="warn">부족</option>
          <option value="zero">재고 없음</option>
        </select>
      </div>

      {/* 선택 삭제 바 */}
      {isSuper && selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size}개 선택됨</span>
          <span className="spacer" />
          <button className="del" type="button" onClick={deleteSelected} disabled={deleting}>
            {deleting ? '삭제 중…' : '선택 삭제'}
          </button>
          <button className="clear" type="button" onClick={() => setSelected(new Set())}>선택 해제</button>
        </div>
      )}

      {/* 테이블 */}
      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="big">
              {products.length === 0 ? '아직 등록된 상품이 없습니다' : '조건에 맞는 상품이 없습니다'}
            </div>
            <div className="sub">
              {products.length === 0
                ? (isSuper ? '오른쪽 위 “＋ 새 상품 등록”으로 상품을 추가해 보세요.' : '관리자가 상품을 등록하면 여기에 표시됩니다.')
                : '검색어나 필터를 바꿔보세요.'}
            </div>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {isSuper && (
                    <th className="check-col">
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 선택" />
                    </th>
                  )}
                  <th>상품 · Product</th>
                  <th>카테고리</th>
                  <th className="r">단가</th>
                  <th className="r">현재고</th>
                  <th className="r">판매</th>
                  <th className="r">샘플</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const b = stockBadge(p.stock_quantity, p.safety_stock);
                  const opts = variantsByProduct[p.product_id] || [];
                  const hasOpts = opts.length > 1;
                  const isOpen = expanded.has(p.product_id);
                  const colSpan = isSuper ? 7 : 6;
                  return (
                    <Fragment key={p.product_id}>
                      <tr
                        className="clickable"
                        onClick={() => router.push(`/product/${p.product_id}`)}
                      >
                        {isSuper && (
                          <td className="check-col" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="row-check"
                              type="checkbox"
                              checked={selected.has(p.product_id)}
                              onChange={() => toggleOne(p.product_id)}
                              aria-label="선택"
                            />
                          </td>
                        )}
                        <td>
                          <div className="prod">
                            {hasOpts ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleExpand(p.product_id); }}
                                aria-label="옵션 펼치기"
                                style={{ width: 22, height: 22, flexShrink: 0, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel)', cursor: 'pointer', color: 'var(--muted)', fontSize: 11 }}
                              >
                                {isOpen ? '▾' : '▸'}
                              </button>
                            ) : (
                              <span style={{ width: 22, flexShrink: 0, display: 'inline-block' }} />
                            )}
                            {p.image_url
                              ? <img className="thumb" src={p.image_url} alt="" />
                              : <div className="thumb ph">IMG</div>}
                            <div className="meta">
                              <div className="name">
                                {p.name}
                                {hasOpts && <span className="badge cat" style={{ marginLeft: 8 }}>옵션 {opts.length}</span>}
                              </div>
                              <div className="sku mono">{p.sku}</div>
                            </div>
                          </div>
                        </td>
                        <td>{p.category_name ? <span className="badge cat">{p.category_name}</span> : <span className="faint">—</span>}</td>
                        <td className="r num">{usd(p.price)}</td>
                        <td className="r">
                          <div className="stock-cell">
                            <span className="stock-num num">{p.stock_quantity}</span>
                            <span className={`badge ${b.cls}`}>{b.label}</span>
                          </div>
                        </td>
                        <td className="r num muted">{p.sales_qty}</td>
                        <td className="r num muted">{p.sample_qty}</td>
                      </tr>

                      {isOpen && opts.map((v) => {
                        const vb = stockBadge(v.stock_quantity, v.safety_stock);
                        return (
                          <tr
                            key={v.variant_id}
                            className="clickable"
                            onClick={() => router.push(`/product/${p.product_id}`)}
                            style={{ background: '#fbfaf7' }}
                          >
                            <td colSpan={colSpan} style={{ paddingLeft: isSuper ? 96 : 60 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--faint)' }}>↳</span>
                                <b>{v.option_name}</b>
                                {v.is_default && <span className="badge cat">기본</span>}
                                {v.sku && <span className="mono faint" style={{ fontSize: 12 }}>{v.sku}</span>}
                                <span className="num muted" style={{ fontSize: 13 }}>{usd(v.price)}</span>
                                <span className="stock-cell" style={{ marginLeft: 'auto' }}>
                                  <span className="stock-num num">{v.stock_quantity}</span>
                                  <span className={`badge ${vb.cls}`}>{vb.label}</span>
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 상품 등록 모달 */}
      {isSuper && showAdd && (
        <div className="modal-overlay" onClick={() => !saving && setShowAdd(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>새 상품 등록</h2>
            <p className="sub">최고관리자만 상품을 등록할 수 있습니다.</p>

            {fErr && <div className="form-error">{fErr}</div>}

            <div className="row2">
              <div className="field">
                <label>SKU · 상품코드 <span className="faint" style={{ fontWeight: 500 }}>(비워두면 자동)</span></label>
                <input value={form.sku} onChange={(e) => upd('sku', e.target.value)} placeholder={`자동 생성: ${genSku(products)}`} />
              </div>
              <div className="field">
                <label>카테고리</label>
                <input list="cat-list" value={form.category} onChange={(e) => upd('category', e.target.value)} placeholder="선택 또는 새로 입력" />
                <datalist id="cat-list">
                  {categories.map((c) => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
            </div>

            <div className="field">
              <label>상품명 *</label>
              <input value={form.name} onChange={(e) => upd('name', e.target.value)} placeholder="예: 베이직 후드" />
            </div>

            <div className="row2">
              <div className="field">
                <label>단가 ($)</label>
                <input type="number" min="0" value={form.price} onChange={(e) => upd('price', e.target.value)} placeholder="0" />
              </div>
              <div className="field">
                <label>안전재고</label>
                <input type="number" min="0" value={form.safety} onChange={(e) => upd('safety', e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="field">
              <label>초기 재고 (선택)</label>
              <input type="number" min="0" value={form.initStock} onChange={(e) => upd('initStock', e.target.value)} placeholder="0" />
            </div>

            <div className="field">
              <label>상품 이미지 (선택)</label>
              <ImageUploader
                value={form.imageUrl}
                onChange={(url) => upd('imageUrl', url)}
                disabled={saving}
              />
            </div>
         
            <div className="modal-foot">
              <button className="btn ghost" type="button" onClick={() => setShowAdd(false)} disabled={saving}>취소</button>
              <button className="btn" type="button" onClick={createProduct} disabled={saving}>
                {saving ? '등록 중…' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
