import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TransactionForm from './TransactionForm';
import ProductThumb from '@/app/components/ProductThumb';
import VariantManager from './Variantmanager';

export const dynamic = 'force-dynamic';

// direction/reason → 화면용 유형 라벨
const LABELS = {
  PURCHASE: { text: '입고', dir: 'in' },
  RETURN: { text: '반품', dir: 'in' },
  EXCHANGE_IN: { text: '교환입고', dir: 'in' },
  SALE: { text: '판매', dir: 'out' },
  SAMPLE: { text: '샘플', dir: 'out' },
  EXCHANGE_OUT: { text: '교환출고', dir: 'out' },
  ADJUSTMENT: { text: '조정', dir: 'in' },
};

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default async function ProductDetail({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/product/${id}`);

  // 최고관리자(super)만 대표 이미지 변경 가능
  const { data: prof } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isSuper = prof?.role === 'super';

  // 상품 개요 (재고/판매/샘플 포함)
  const { data: product } = await supabase
    .from('product_overview')
    .select('*')
    .eq('product_id', id)
    .maybeSingle();

  if (!product) notFound();

  // 옵션(variant) + 세트가격 + 옵션별 재고
  const { data: variants } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const variantIds = (variants || []).map((v) => v.id);
  const tiersByVariant = {};
  const stockByVariant = {};
  if (variantIds.length) {
    const { data: tiers } = await supabase
      .from('variant_price_tiers')
      .select('*')
      .in('variant_id', variantIds)
      .order('pack_qty', { ascending: true });
    for (const t of tiers || []) {
      if (!tiersByVariant[t.variant_id]) tiersByVariant[t.variant_id] = [];
      tiersByVariant[t.variant_id].push(t);
    }
    const { data: vstock } = await supabase
      .from('variant_stock')
      .select('variant_id, stock_quantity')
      .in('variant_id', variantIds);
    for (const s of vstock || []) stockByVariant[s.variant_id] = s.stock_quantity;
  }

  const variantData = (variants || []).map((v) => ({
    ...v,
    tiers: tiersByVariant[v.id] || [],
    stock_quantity: stockByVariant[v.id] || 0,
  }));

  // 거래 이력
  const { data: txs } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('product_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  // 담당자 이름 매핑
  const ids = [...new Set((txs || []).map((t) => t.created_by).filter(Boolean))];
  let nameMap = {};
  if (ids.length) {
    const { data: profiles } = await supabase
      .from('admin_profiles')
      .select('id, display_name')
      .in('id', ids);
    nameMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.display_name]));
  }

  // 교환용 다른 상품 목록
  const { data: others } = await supabase
    .from('product_overview')
    .select('product_id, name, sku')
    .neq('product_id', id)
    .order('name');

  const stockCls = product.stock_quantity <= 0 ? 'zero'
    : product.stock_quantity <= product.safety_stock ? 'warn' : 'ok';
  const stockLabel = product.stock_quantity <= 0 ? '재고 없음'
    : product.stock_quantity <= product.safety_stock ? '부족' : '정상';

  return (
    <main className="page">
      <Link href="/" className="back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
        재고 현황으로
      </Link>

      <div className="detail-head">
        <ProductThumb productId={id} imageUrl={product.image_url} editable={isSuper} />
        <div>
          <div className="title">{product.name}</div>
          <div className="subline">
            <span className="mono">{product.sku}</span>
            {product.category_name && <span className="badge cat">{product.category_name}</span>}
            <span>단가 <b className="num">${Number(product.price || 0).toLocaleString('en-US')}</b></span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="faint" style={{ fontSize: 12, fontWeight: 600 }}>현재고</div>
          <div className="stock-cell" style={{ marginTop: 4 }}>
            <span className="stock-num num" style={{ fontSize: 24 }}>{product.stock_quantity}</span>
            <span className={`badge ${stockCls}`}>{stockLabel}</span>
          </div>
        </div>
      </div>

      <VariantManager productId={id} canEdit={isSuper} userId={user.id} initialVariants={variantData} />

      <div className="grid-2">
        {/* 거래 등록 */}
        <div className="card">
          <div className="card-head">거래 등록 · New transaction</div>
          <div className="card-body">
            <TransactionForm
              productId={id}
              userId={user.id}
              otherProducts={others || []}
              variants={variantData}
            />
          </div>
        </div>

        {/* 최근 이력 */}
        <div className="card hist">
          <div className="card-head">최근 거래 이력 · Recent history</div>
          <div className="table-scroll">
            {(!txs || txs.length === 0) ? (
              <div className="empty">
                <div className="big">아직 거래 내역이 없습니다</div>
                <div className="sub">왼쪽에서 첫 입고를 기록해 보세요.</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>유형</th>
                    <th className="r">수량</th>
                    <th>담당자</th>
                    <th>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => {
                    const L = LABELS[t.reason] || { text: t.reason, dir: 'in' };
                    const dir = t.direction === 'OUT' ? 'out' : 'in';
                    const isIn = dir === 'in';
                    return (
                      <tr key={t.id}>
                        <td className="num muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.created_at)}</td>
                        <td><span className={`type-tag ${dir}`}>{L.text}</span></td>
                        <td className={`r num ${isIn ? 'qty-in' : 'qty-out'}`}>{isIn ? '+' : '−'}{t.quantity}</td>
                        <td>{nameMap[t.created_by] || <span className="faint">—</span>}</td>
                        <td className="muted">{t.note || <span className="faint">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
