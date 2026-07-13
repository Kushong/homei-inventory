'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// 지도 기본 중심: 프놈펜
const DEFAULT_CENTER = [11.5564, 104.9282];

// ---- Leaflet CDN 동적 로딩 (npm 의존성 없이) ----
function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.L) return resolve(window.L);

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const existing = document.getElementById('leaflet-js');
    if (existing) {
      if (window.L) return resolve(window.L);
      existing.addEventListener('load', () => resolve(window.L));
      existing.addEventListener('error', () => reject(new Error('지도 로딩 실패')));
      return;
    }

    const s = document.createElement('script');
    s.id = 'leaflet-js';
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.async = true;
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error('지도 로딩 실패'));
    document.head.appendChild(s);
  });
}

function getCurrentPos() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return reject(new Error('이 브라우저는 위치를 지원하지 않아요.'));
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function pinSvg(color) {
  return (
    '<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 21 13 21s13-11.25 13-21C26 5.82 20.18 0 13 0z" fill="' + color + '"/>' +
    '<circle cx="13" cy="13" r="4.5" fill="#fff"/></svg>'
  );
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
}

export default function LocationCard({ maxWidth = 480 }) {
  const supabase = createClient();

  const [userId, setUserId] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [locating, setLocating] = useState(false);
  const [pending, setPending] = useState(null); // { lat, lng, accuracy }
  const [label, setLabel] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editMemo, setEditMemo] = useState('');

  const [mapReady, setMapReady] = useState(false);

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const pendingMarkerRef = useRef(null);
  const LRef = useRef(null);

  // ---- 유저 + 목록 로드 ----
  const loadList = useCallback(async (uid) => {
    const { data, error: e } = await supabase
      .from('private_locations')
      .select('*')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false });
    if (e) { setError(e.message); return []; }
    setList(data || []);
    return data || [];
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('세션이 없습니다. 다시 로그인해 주세요.');
        setLoading(false);
        return;
      }
      setUserId(user.id);
      await loadList(user.id);
      setLoading(false);
    })();
  }, [supabase, loadList]);

  // ---- 지도 초기화 ----
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !mapElRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(mapElRef.current, { zoomControl: true }).setView(DEFAULT_CENTER, 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 120);
      setMapReady(true);
    }).catch((e) => setError(e.message || '지도 로딩 실패'));
    return () => {
      cancelled = true;
      if (mapRef.current) { try { mapRef.current.remove(); } catch (e) {} mapRef.current = null; }
    };
  }, []);

  const focusOn = useCallback((lat, lng, zoom = 16) => {
    if (mapRef.current) mapRef.current.setView([lat, lng], zoom);
  }, []);

  // ---- 저장된 위치 마커 렌더 ----
  useEffect(() => {
    const L = LRef.current, layer = markersRef.current, map = mapRef.current;
    if (!L || !layer || !map || !mapReady) return;
    layer.clearLayers();
    const pts = [];
    list.forEach((it) => {
      const m = L.marker([it.lat, it.lng], {
        icon: L.divIcon({
          className: '', html: pinSvg('#2563eb'),
          iconSize: [26, 34], iconAnchor: [13, 34], popupAnchor: [0, -30],
        }),
      });
      const name = it.label || '이름 없음';
      m.bindPopup('<b>' + escapeHtml(name) + '</b>' + (it.memo ? '<br>' + escapeHtml(it.memo) : ''));
      m.addTo(layer);
      pts.push([it.lat, it.lng]);
    });
    if (pts.length && !pending) {
      try { map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 }); } catch (e) {}
    }
  }, [list, mapReady, pending]);

  // ---- 임시(현재 위치) 마커 ----
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map || !mapReady) return;
    if (pendingMarkerRef.current) {
      try { map.removeLayer(pendingMarkerRef.current); } catch (e) {}
      pendingMarkerRef.current = null;
    }
    if (pending) {
      const m = L.marker([pending.lat, pending.lng], {
        icon: L.divIcon({
          className: '', html: pinSvg('#f97316'),
          iconSize: [26, 34], iconAnchor: [13, 34],
        }),
      }).addTo(map);
      pendingMarkerRef.current = m;
      map.setView([pending.lat, pending.lng], 16);
    }
  }, [pending, mapReady]);

  const capture = async () => {
    setError(''); setLocating(true);
    try {
      const c = await getCurrentPos();
      setPending({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy });
      setLabel(''); setMemo('');
    } catch (e) {
      if (e && e.code === 1) setError('위치 권한이 거부됐어요. 브라우저 설정에서 위치 접근을 허용해 주세요.');
      else if (e && e.code === 3) setError('위치 확인이 시간 초과됐어요. 다시 시도해 주세요.');
      else setError((e && e.message) || '위치를 가져오지 못했어요.');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!pending || !userId) return;
    setSaving(true); setError('');
    const { data, error: e } = await supabase
      .from('private_locations')
      .insert({
        owner_id: userId,
        label: label.trim() || null,
        memo: memo.trim() || null,
        lat: pending.lat,
        lng: pending.lng,
        accuracy: pending.accuracy == null ? null : pending.accuracy,
      })
      .select()
      .single();
    setSaving(false);
    if (e) { setError(e.message); return; }
    setList((prev) => [data, ...prev]);
    setPending(null); setLabel(''); setMemo('');
  };

  const cancelPending = () => { setPending(null); setLabel(''); setMemo(''); };

  const startEdit = (it) => { setEditId(it.id); setEditLabel(it.label || ''); setEditMemo(it.memo || ''); };
  const cancelEdit = () => { setEditId(null); setEditLabel(''); setEditMemo(''); };
  const saveEdit = async (id) => {
    const { data, error: e } = await supabase
      .from('private_locations')
      .update({
        label: editLabel.trim() || null,
        memo: editMemo.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (e) { setError(e.message); return; }
    setList((prev) => prev.map((x) => (x.id === id ? data : x)));
    cancelEdit();
  };

  const remove = async (id) => {
    if (typeof window !== 'undefined' && !window.confirm('이 위치를 삭제할까요?')) return;
    const { error: e } = await supabase.from('private_locations').delete().eq('id', id);
    if (e) { setError(e.message); return; }
    setList((prev) => prev.filter((x) => x.id !== id));
    if (editId === id) cancelEdit();
  };

  const openIn = (url) => { if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener'); };

  // ---- 스타일 ----
  const card = { background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 };
  const itemCard = { background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10, padding: '10px 12px', marginBottom: 8 };
  const primaryBtn = { background: '#18181b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
  const ghostBtn = { background: '#fff', color: '#52525b', border: '1px solid #e4e4e7', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const chip = { background: '#fafafa', color: '#3f3f46', border: '1px solid #e4e4e7', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
  const input = { width: '100%', boxSizing: 'border-box', border: '1px solid #e4e4e7', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginTop: 6, outline: 'none', color: '#18181b', background: '#fff' };
  const errBox = { marginTop: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '8px 10px', fontSize: 12 };
  const pendingBox = { marginTop: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 12 };

  return (
    <div style={{ maxWidth, width: '100%' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#18181b' }}>📍 위치 저장</div>
          <button onClick={capture} disabled={locating} style={{ ...primaryBtn, opacity: locating ? 0.6 : 1 }}>
            {locating ? '위치 확인 중…' : '현재 위치 가져오기'}
          </button>
        </div>

        <div
          ref={mapElRef}
          style={{ height: 260, width: '100%', borderRadius: 10, overflow: 'hidden', background: '#f4f4f5', border: '1px solid #e4e4e7' }}
        />

        {error ? <div style={errBox}>{error}</div> : null}

        {pending ? (
          <div style={pendingBox}>
            <div style={{ fontSize: 13, color: '#18181b', fontWeight: 700, marginBottom: 4 }}>
              새 위치 · {pending.lat.toFixed(6)}, {pending.lng.toFixed(6)}
              {pending.accuracy ? (
                <span style={{ color: '#71717a', fontWeight: 500 }}> (±{Math.round(pending.accuracy)}m)</span>
              ) : null}
            </div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="이름 (예: 집, 사무실)" style={input} />
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" rows={2} style={{ ...input, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? '저장 중…' : '저장'}
              </button>
              <button onClick={cancelPending} style={ghostBtn}>취소</button>
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div style={{ fontSize: 13, color: '#a1a1aa' }}>불러오는 중…</div>
        ) : list.length === 0 ? (
          <div style={{ fontSize: 13, color: '#a1a1aa' }}>저장된 위치가 없어요. 위 버튼으로 현재 위치를 저장해 보세요.</div>
        ) : (
          list.map((it) => (
            <div key={it.id} style={itemCard}>
              {editId === it.id ? (
                <div>
                  <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="이름" style={input} />
                  <textarea value={editMemo} onChange={(e) => setEditMemo(e.target.value)} placeholder="메모" rows={2} style={{ ...input, resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => saveEdit(it.id)} style={primaryBtn}>저장</button>
                    <button onClick={cancelEdit} style={ghostBtn}>취소</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#18181b' }}>{it.label || '이름 없음'}</div>
                    <div style={{ fontSize: 11, color: '#a1a1aa', whiteSpace: 'nowrap' }}>{fmtDate(it.created_at)}</div>
                  </div>
                  {it.memo ? (
                    <div style={{ fontSize: 13, color: '#52525b', marginTop: 2, whiteSpace: 'pre-wrap' }}>{it.memo}</div>
                  ) : null}
                  <div style={{ fontSize: 12, color: '#71717a', marginTop: 4 }}>
                    {Number(it.lat).toFixed(6)}, {Number(it.lng).toFixed(6)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <button onClick={() => focusOn(it.lat, it.lng)} style={chip}>지도에서 보기</button>
                    <button onClick={() => openIn('https://www.google.com/maps/search/?api=1&query=' + it.lat + ',' + it.lng)} style={chip}>구글맵</button>
                    <button onClick={() => openIn('https://www.openstreetmap.org/?mlat=' + it.lat + '&mlon=' + it.lng + '#map=17/' + it.lat + '/' + it.lng)} style={chip}>OSM</button>
                    <button onClick={() => startEdit(it)} style={chip}>수정</button>
                    <button onClick={() => remove(it.id)} style={{ ...chip, color: '#dc2626', borderColor: '#fecaca' }}>삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
