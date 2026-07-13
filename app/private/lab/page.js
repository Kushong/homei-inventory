import ExchangeCard from '@/app/private/ExchangeCard';
import LocationCard from '@/app/private/LocationCard';

export const dynamic = 'force-dynamic';

export default function LabPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#18181b', margin: '0 0 4px' }}>
        실험실 🧪
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#71717a' }}>
        이것저것 실험해 보는 공간이에요.
      </p>

      <ExchangeCard showConverter maxWidth={420} />

      <p style={{ margin: '16px 0 0', fontSize: 12, color: '#a1a1aa' }}>
        데이터: 한국수출입은행 Open API · 영업일 11시 전후 갱신 (주말·휴일은 직전 영업일 기준)
      </p>

      <div style={{ height: 28 }} />

      <LocationCard maxWidth={480} />

      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#a1a1aa' }}>
        지도: OpenStreetMap · 위치는 브라우저 GPS 권한 허용 후 저장됩니다.
      </p>
    </div>
  );
}
