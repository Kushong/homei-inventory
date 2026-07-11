'use client';

import { useState, useEffect, useCallback } from 'react';

function fmt(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function ExchangeCard({ showConverter = false, maxWidth = 380 }) {
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
    <section
      style={{
        border: '1px solid #e4e4e7',
        borderRadius: 14,
        background: '#fff',
        padding: 18,
        maxWidth,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#27272a' }}>💱 환율</span>
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
              {date}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          title="새로고침"
          style={{
            fontSize: 12,
            color: '#3f3f46',
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: 8,
            padding: '5px 10px',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '…' : '↻'}
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
        <div style={{ fontSize: 13, color: '#a1a1aa', padding: '6px 2px' }}>
          불러오는 중이에요…
        </div>
      )}

      {!error && rates.length > 0 && (
        <>
          <div>
            {rates.map((r, i) => (
              <div
                key={r.code}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 2px',
                  borderTop: i === 0 ? 'none' : '1px solid #f4f4f5',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                  <span>{r.flag}</span>
                  <span style={{ fontWeight: 600, color: '#27272a', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </span>
                  <span style={{ color: '#a1a1aa', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {r.per === 100 ? '100' : ''}
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: '#18181b', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(r.base)}
                </span>
              </div>
            ))}
          </div>

          {showConverter && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e4e4e7' }}>
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
                    width: 100,
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
          )}
        </>
      )}
    </section>
  );
}
