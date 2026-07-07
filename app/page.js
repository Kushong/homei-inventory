import { createClient } from '@/lib/supabase/server';
import Dashboard from './Dashboard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();

  // 로그인 여부 + 최고관리자(super) 여부
  const { data: { user } } = await supabase.auth.getUser();

  let isSuper = false;
  if (user) {
    const { data: prof } = await supabase
      .from('admin_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    isSuper = prof?.role === 'super';
  }

  const [{ data: products }, { data: statsRows }, { data: cats }, { data: variants }] = await Promise.all([
    supabase.from('product_overview').select('*').order('name'),
    supabase.from('dashboard_stats').select('*').limit(1),
    supabase.from('categories').select('id, name').order('name'),
    supabase.from('variant_stock').select('*').order('sort_order', { ascending: true }),
  ]);

  // 옵션별 세트가격(tier) 붙이기
  let variantsWithTiers = variants || [];
  const variantIds = (variants || []).map((v) => v.variant_id).filter(Boolean);
  if (variantIds.length) {
    const { data: tiers } = await supabase
      .from('variant_price_tiers')
      .select('variant_id, pack_qty, price')
      .in('variant_id', variantIds)
      .order('pack_qty', { ascending: true });
    const byVariant = {};
    for (const t of tiers || []) {
      (byVariant[t.variant_id] ||= []).push(t);
    }
    variantsWithTiers = (variants || []).map((v) => ({
      ...v,
      tiers: byVariant[v.variant_id] || [],
    }));
  }

  const stats = statsRows?.[0] || {
    total_products: 0, low_stock_count: 0, today_in: 0, today_out: 0,
  };

  return (
    <Dashboard
      products={products || []}
      variants={variantsWithTiers}
      stats={stats}
      categories={cats || []}
      isSuper={isSuper}
      userId={user?.id || null}
    />
  );
}
