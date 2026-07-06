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

  const [{ data: products }, { data: statsRows }, { data: cats }] = await Promise.all([
    supabase.from('product_overview').select('*').order('name'),
    supabase.from('dashboard_stats').select('*').limit(1),
    supabase.from('categories').select('id, name').order('name'),
  ]);

  const stats = statsRows?.[0] || {
    total_products: 0, low_stock_count: 0, today_in: 0, today_out: 0,
  };

  return (
    <Dashboard
      products={products || []}
      stats={stats}
      categories={cats || []}
      isSuper={isSuper}
      userId={user?.id || null}
    />
  );
}
