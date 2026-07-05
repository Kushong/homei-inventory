import { createClient } from '@/lib/supabase/server';
import Dashboard from './Dashboard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();

  const [{ data: products }, { data: statsRows }] = await Promise.all([
    supabase.from('product_overview').select('*').order('name'),
    supabase.from('dashboard_stats').select('*').limit(1),
  ]);

  const stats = statsRows?.[0] || {
    total_products: 0, low_stock_count: 0, today_in: 0, today_out: 0,
  };

  const categories = [
    ...new Set((products || []).map((p) => p.category_name).filter(Boolean)),
  ].sort();

  return (
    <Dashboard
      products={products || []}
      stats={stats}
      categories={categories}
    />
  );
}
