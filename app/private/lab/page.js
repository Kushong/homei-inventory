'use client';

import { useState, useEffect, useCallback } from 'react';

function fmt(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function LabPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(null);
  const [rates, setRates] = useState([]);
  const [amount, setAmount] = useState('100');
  const [cur, setCur] = useState('USD');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/private/exchange', { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || '불러오기에 실패했습니다.');
      setDate(json.date);
      setRates(json.rates || []);
    } catch (e) {
      setError(e.message || String(e));
      setRates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = rates.find((r) => r.code === cur) || rates[0] || null;
  const amt = Number(String(amount).replace(/,/g, '')) || 0;
  const krw =
    selected && selected.base != null ? (amt * selected.base) / selected.per : null;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#18181b', margin: '0 0 4px' }}>
        실험실 🧪
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#71717a' }}>
        이것저것 실험해 보는 공간이에요. 첫 기능은 한국수출입은행 환율 위젯.
      </p>

      <section
        style={{
          border: '1px solid #e4e4e7',
          borderRadius: 14,
          background: '#fff',
          padding: 20,
          maxWidth: 560,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#27272a' }}>💱 오늘의 환율</span>
            {date && (
              <span
                style={{
                  fontSize: 11,
                  color: '#71717a',
                  background: '#f4f4f5',
                  border: '1px solid #e4e4e7',
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                {date} 기준
              </span>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontSize: 12,
              color: '#3f3f46',
              background: '#fafafa',
              border: '1px solid #e4e4e7',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: '#b91c1c',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {!error && loading && rates.length === 0 && (
          <div style={{ fontSize: 13, color: '#a1a1aa', padding: '8px 2px' }}>
            환율을 불러오는 중이에요…
          </div>
        )}

        {!error && rates.length > 0 && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#a1a1aa', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', fontWeight: 600, padding: '6px 4px' }}>통화</th>
                    <th style={{ fontWeight: 600, padding: '6px 4px' }}>매매기준율</th>
                    <th style={{ fontWeight: 600, padding: '6px 4px' }}>살 때</th>
                    <th style={{ fontWeight: 600, padding: '6px 4px' }}>팔 때</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.code} style={{ borderTop: '1px solid #f4f4f5' }}>
                      <td style={{ padding: '9px 4px', textAlign: 'left' }}>
                        <span style={{ marginRight: 6 }}>{r.flag}</span>
                        <span style={{ fontWeight: 600, color: '#27272a' }}>{r.name}</span>
                        <span style={{ color: '#a1a1aa', marginLeft: 6, fontSize: 11 }}>
                          {r.per === 100 ? `${r.code} · 100단위` : r.code}
                        </span>
                      </td>
                      <td style={{ padding: '9px 4px', textAlign: 'right', fontWeight: 700, color: '#18181b' }}>
                        {fmt(r.base)}
                      </td>
                      <td style={{ padding: '9px 4px', textAlign: 'right', color: '#52525b' }}>
                        {fmt(r.buy)}
                      </td>
                      <td style={{ padding: '9px 4px', textAlign: 'right', color: '#52525b' }}>
                        {fmt(r.sell)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: '1px solid #f4f4f5',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#71717a', marginBottom: 8 }}>
                간이 환산기 (매매기준율 기준)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: 110,
                    fontSize: 14,
                    padding: '8px 10px',
                    border: '1px solid #e4e4e7',
                    borderRadius: 8,
                    textAlign: 'right',
                  }}
                />
                <select
                  value={cur}
                  onChange={(e) => setCur(e.target.value)}
                  style={{
                    fontSize: 14,
                    padding: '8px 10px',
                    border: '1px solid #e4e4e7',
                    borderRadius: 8,
                    background: '#fff',
                  }}
                >
                  {rates.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code}
                    </option>
                  ))}
                </select>
                <span style={{ color: '#a1a1aa' }}>=</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#18181b' }}>
                  ₩ {krw != null ? fmt(krw, 0) : '-'}
                </span>
              </div>
              {selected && selected.per === 100 && (
                <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 6 }}>
                  ※ {selected.code}는 100단위 고시라 100으로 나눠 계산했어요.
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <p style={{ margin: '16px 0 0', fontSize: 12, color: '#a1a1aa' }}>
        데이터: 한국수출입은행 Open API · 영업일 11시 전후 갱신 (주말·휴일은 직전 영업일 기준)
      </p>
    </div>
  );
}
