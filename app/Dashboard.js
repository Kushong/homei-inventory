'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

function stockBadge(qty, safety) {
  if (qty <= 0) return { cls: 'zero', label: '재고 없음' };
  if (qty <= safety) return { cls: 'warn', label: '부족' };
  return { cls: 'ok', label: '정상' };
}

function won(n) {
  const v = Number(n || 0);
  return '₩' + v.toLocaleString('ko-KR');
}

export default function Dashboard({ products, stats, categories }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');

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

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">재고 현황 <span className="faint" style={{ fontWeight: 700, fontSize: 18 }}>Inventory</span></h1>
        <p className="page-sub">실시간 입·출고 기준으로 자동 집계됩니다. 상품을 눌러 거래를 등록하세요.</p>
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
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">전체 상태</option>
          <option value="ok">정상</option>
          <option value="warn">부족</option>
          <option value="zero">재고 없음</option>
        </select>
      </div>

      {/* 테이블 */}
      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="big">
              {products.length === 0 ? '아직 등록된 상품이 없습니다' : '조건에 맞는 상품이 없습니다'}
            </div>
            <div className="sub">
              {products.length === 0
                ? 'Supabase Table Editor에서 products 테이블에 상품을 추가해 보세요.'
                : '검색어나 필터를 바꿔보세요.'}
            </div>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
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
                  return (
                    <tr
                      key={p.product_id}
                      className="clickable"
                      onClick={() => router.push(`/product/${p.product_id}`)}
                    >
                      <td>
                        <div className="prod">
                          {p.image_url
                            ? <img className="thumb" src={p.image_url} alt="" />
                            : <div className="thumb ph">IMG</div>}
                          <div className="meta">
                            <div className="name">{p.name}</div>
                            <div className="sku mono">{p.sku}</div>
                          </div>
                        </div>
                      </td>
                      <td>{p.category_name ? <span className="badge cat">{p.category_name}</span> : <span className="faint">—</span>}</td>
                      <td className="r num">{won(p.price)}</td>
                      <td className="r">
                        <div className="stock-cell">
                          <span className="stock-num num">{p.stock_quantity}</span>
                          <span className={`badge ${b.cls}`}>{b.label}</span>
                        </div>
                      </td>
                      <td className="r num muted">{p.sales_qty}</td>
                      <td className="r num muted">{p.sample_qty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
