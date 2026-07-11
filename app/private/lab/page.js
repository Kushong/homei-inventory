import ExchangeCard from '@/app/private/ExchangeCard';

export const dynamic = 'force-dynamic';

export default function LabPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#18181b', margin: '0 0 4px' }}>
        실험실 🧪
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#71717a' }}>
        이것저것 실험해 보는 공간이에요. 첫 기능은 한국수출입은행 환율 위젯.
      </p>

      <ExchangeCard showConverter maxWidth={420} />

      <p style={{ margin: '16px 0 0', fontSize: 12, color: '#a1a1aa' }}>
        데이터: 한국수출입은행 Open API · 영업일 11시 전후 갱신 (주말·휴일은 직전 영업일 기준)
      </p>
    </div>
  );
}
