'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

// ── 검증용 고정 문자열 (마스터 암호 확인용) ──
const VERIFIER = 'homei-vault-verifier-v1';
const PBKDF2_ITER = 250000;

// ── base64 <-> ArrayBuffer ──
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ── 마스터 암호 + salt → AES-256-GCM 키 ──
async function deriveKey(passphrase, saltB64) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(b64ToBuf(saltB64)),
      iterations: PBKDF2_ITER,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(obj))
  );
  return { cipher: bufToB64(cipher), iv: bufToB64(iv.buffer) };
}

async function decryptJSON(key, cipherB64, ivB64) {
  const dec = new TextDecoder();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(ivB64)) },
    key,
    b64ToBuf(cipherB64)
  );
  return JSON.parse(dec.decode(plain));
}

// ── 공통 스타일 ──
const inputStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #d4d4d8',
  borderRadius: 8,
  fontSize: 14,
  boxSizing: 'border-box',
};
const btnPrimary = {
  padding: '9px 16px',
  border: 'none',
  borderRadius: 8,
  background: '#18181b',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
const btnGhost = {
  padding: '7px 12px',
  border: '1px solid #d4d4d8',
  borderRadius: 8,
  background: '#fff',
  color: '#3f3f46',
  fontSize: 13,
  cursor: 'pointer',
};

export default function FavoritesPage() {
  const supabase = createClient();

  const [phase, setPhase] = useState('loading'); // loading | setup | locked | unlocked
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 마스터 키 (메모리에만; 저장 안 함)
  const cryptoKeyRef = useRef(null);
  const [meta, setMeta] = useState(null);

  // 입력값
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');

  // 금고 데이터
  const [items, setItems] = useState([]);        // DB 행 (title,url,pinned + cipher)
  const [plain, setPlain] = useState({});         // { id: {username,password,memo} }
  const [revealed, setRevealed] = useState({});   // { id: true }
  const [toast, setToast] = useState('');

  // 추가/편집 폼
  const [editing, setEditing] = useState(null);   // null | 'new' | id
  const [form, setForm] = useState({ title: '', url: '', username: '', password: '', memo: '' });

  const clipTimer = useRef(null);

  // ── 최초: 금고 메타 존재 여부 확인 ──
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: e } = await supabase
        .from('private_vault_meta')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (e) {
        setError('금고 정보를 불러오지 못했어: ' + e.message);
        return;
      }
      if (!data) {
        setPhase('setup');
      } else {
        setMeta(data);
        setPhase('locked');
      }
    })();
    return () => {
      if (clipTimer.current) clearTimeout(clipTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  // ── 금고 최초 생성 ──
  async function handleSetup() {
    setError('');
    if (pw1.length < 8) return setError('마스터 암호는 8자 이상으로 정해줘.');
    if (pw1 !== pw2) return setError('두 입력이 서로 달라.');
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const saltB64 = bufToB64(saltBytes.buffer);
      const key = await deriveKey(pw1, saltB64);
      const v = await encryptJSON(key, VERIFIER);
      const { error: e } = await supabase.from('private_vault_meta').insert({
        owner_id: user.id,
        kdf_salt: saltB64,
        verifier_cipher: v.cipher,
        verifier_iv: v.iv,
      });
      if (e) throw e;
      cryptoKeyRef.current = key;
      setPw1(''); setPw2('');
      await loadItems();
      setPhase('unlocked');
    } catch (err) {
      setError('금고 생성 실패: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  }

  // ── 잠금 해제 ──
  async function handleUnlock() {
    setError('');
    if (!pw1) return;
    setBusy(true);
    try {
      const key = await deriveKey(pw1, meta.kdf_salt);
      let ok = false;
      try {
        const check = await decryptJSON(key, meta.verifier_cipher, meta.verifier_iv);
        ok = check === VERIFIER;
      } catch (_) {
        ok = false;
      }
      if (!ok) { setError('마스터 암호가 틀렸어.'); setBusy(false); return; }
      cryptoKeyRef.current = key;
      setPw1('');
      await loadItems();
      setPhase('unlocked');
    } catch (err) {
      setError('잠금 해제 실패: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  }

  // ── 항목 로드 + 복호화 ──
  async function loadItems() {
    const { data, error: e } = await supabase
      .from('private_favorites')
      .select('*')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    if (e) { setError('목록 로드 실패: ' + e.message); return; }
    setItems(data || []);
    const key = cryptoKeyRef.current;
    const map = {};
    for (const row of data || []) {
      if (row.data_cipher) {
        try {
          map[row.id] = await decryptJSON(key, row.data_cipher, row.data_iv);
        } catch (_) {
          map[row.id] = { username: '', password: '', memo: '', _err: true };
        }
      } else {
        map[row.id] = { username: '', password: '', memo: '' };
      }
    }
    setPlain(map);
  }

  // ── 저장 (추가/편집) ──
  async function handleSave() {
    setError('');
    if (!form.title.trim()) return setError('제목은 필요해.');
    setBusy(true);
    try {
      const key = cryptoKeyRef.current;
      const { data: { user } } = await supabase.auth.getUser();
      const enc = await encryptJSON(key, {
        username: form.username,
        password: form.password,
        memo: form.memo,
      });
      if (editing === 'new') {
        const { error: e } = await supabase.from('private_favorites').insert({
          owner_id: user.id,
          title: form.title.trim(),
          url: form.url.trim(),
          data_cipher: enc.cipher,
          data_iv: enc.iv,
        });
        if (e) throw e;
      } else {
        const { error: e } = await supabase
          .from('private_favorites')
          .update({
            title: form.title.trim(),
            url: form.url.trim(),
            data_cipher: enc.cipher,
            data_iv: enc.iv,
          })
          .eq('id', editing);
        if (e) throw e;
      }
      setEditing(null);
      setForm({ title: '', url: '', username: '', password: '', memo: '' });
      await loadItems();
      showToast('저장됐어');
    } catch (err) {
      setError('저장 실패: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('이 항목을 삭제할까? 되돌릴 수 없어.')) return;
    const { error: e } = await supabase.from('private_favorites').delete().eq('id', id);
    if (e) { setError('삭제 실패: ' + e.message); return; }
    await loadItems();
    showToast('삭제됐어');
  }

  async function togglePin(row) {
    const { error: e } = await supabase
      .from('private_favorites')
      .update({ pinned: !row.pinned })
      .eq('id', row.id);
    if (e) { setError('고정 변경 실패: ' + e.message); return; }
    await loadItems();
  }

  function startEdit(row) {
    const p = plain[row.id] || { username: '', password: '', memo: '' };
    setForm({
      title: row.title || '',
      url: row.url || '',
      username: p.username || '',
      password: p.password || '',
      memo: p.memo || '',
    });
    setEditing(row.id);
    setError('');
  }

  function startNew() {
    setForm({ title: '', url: '', username: '', password: '', memo: '' });
    setEditing('new');
    setError('');
  }

  // ── 복사 + 20초 후 클립보드 자동 삭제 ──
  async function copyValue(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label + ' 복사됨 · 20초 후 자동 삭제');
      if (clipTimer.current) clearTimeout(clipTimer.current);
      clipTimer.current = setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
      }, 20000);
    } catch (_) {
      showToast('복사 실패 (브라우저 권한 확인)');
    }
  }

  // ────────────────────────────────────────── 렌더
  if (phase === 'loading') {
    return <div style={{ color: '#71717a' }}>불러오는 중…</div>;
  }

  // 최초 생성 화면
  if (phase === 'setup') {
    return (
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>⭐ 즐겨찾기 금고 만들기</h1>
        <p style={{ color: '#52525b', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          아이디·비밀번호는 이 <b>마스터 암호</b>로 브라우저에서 암호화돼 저장돼.
          서버·DB에는 암호문만 들어가고, 마스터 암호는 어디에도 저장되지 않아.
          <br />
          <span style={{ color: '#b91c1c' }}>
            ⚠️ 아직 복구 기능이 없어. 마스터 암호를 잊으면 저장한 내용을 되살릴 수 없으니 꼭 기억해줘.
          </span>
        </p>
        {error && <div style={errBox}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={inputStyle} type="password" placeholder="마스터 암호 (8자 이상)"
            value={pw1} onChange={(e) => setPw1(e.target.value)} />
          <input style={inputStyle} type="password" placeholder="마스터 암호 확인"
            value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={handleSetup}>
            {busy ? '생성 중…' : '금고 만들기'}
          </button>
        </div>
      </div>
    );
  }

  // 잠금 해제 화면
  if (phase === 'locked') {
    return (
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>⭐ 즐겨찾기 금고</h1>
        <p style={{ color: '#52525b', fontSize: 14, marginBottom: 20 }}>
          마스터 암호를 입력하면 금고가 열려. (탭을 새로 열거나 새로고침하면 다시 입력해야 해.)
        </p>
        {error && <div style={errBox}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={inputStyle} type="password" placeholder="마스터 암호"
            value={pw1} onChange={(e) => setPw1(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }} />
          <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={handleUnlock}>
            {busy ? '여는 중…' : '금고 열기'}
          </button>
        </div>
      </div>
    );
  }

  // 금고 열림
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>⭐ 즐겨찾기 금고</h1>
        <button style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={startNew}>+ 새 항목</button>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {editing && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            {editing === 'new' ? '새 항목' : '항목 편집'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input style={inputStyle} placeholder="제목 (예: 네이버)"
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input style={inputStyle} placeholder="URL (선택)"
              value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <input style={inputStyle} placeholder="아이디"
              value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input style={inputStyle} type="text" placeholder="비밀번호"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="메모 (선택)"
              value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={handleSave}>
                {busy ? '저장 중…' : '저장'}
              </button>
              <button style={btnGhost} onClick={() => { setEditing(null); setError(''); }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && !editing && (
        <div style={{ color: '#a1a1aa', padding: '40px 0', textAlign: 'center' }}>
          아직 저장된 항목이 없어. “+ 새 항목”으로 시작해봐.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((row) => {
          const p = plain[row.id] || {};
          const isRevealed = !!revealed[row.id];
          const pw = p.password || '';
          return (
            <div key={row.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  {row.pinned ? '📌 ' : ''}{row.title}
                </span>
                {row.url && (
                  <button style={linkBtn} onClick={() => window.open(row.url, '_blank', 'noopener')}>
                    열기 ↗
                  </button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button style={miniBtn} onClick={() => togglePin(row)}>
                    {row.pinned ? '고정해제' : '고정'}
                  </button>
                  <button style={miniBtn} onClick={() => startEdit(row)}>편집</button>
                  <button style={{ ...miniBtn, color: '#b91c1c' }} onClick={() => handleDelete(row.id)}>삭제</button>
                </div>
              </div>

              {p._err && (
                <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 6 }}>
                  이 항목은 현재 마스터 암호로 복호화되지 않아.
                </div>
              )}

              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '70px 1fr', gap: '6px 10px', fontSize: 14 }}>
                <span style={fieldLabel}>아이디</span>
                <div style={fieldRow}>
                  <span style={{ fontFamily: 'monospace' }}>{p.username || '—'}</span>
                  {p.username && (
                    <button style={miniBtn} onClick={() => copyValue(p.username, '아이디')}>복사</button>
                  )}
                </div>

                <span style={fieldLabel}>비번</span>
                <div style={fieldRow}>
                  <span style={{ fontFamily: 'monospace', letterSpacing: isRevealed ? 0 : 2 }}>
                    {pw ? (isRevealed ? pw : '••••••••') : '—'}
                  </span>
                  {pw && (
                    <>
                      <button style={miniBtn}
                        onClick={() => setRevealed({ ...revealed, [row.id]: !isRevealed })}>
                        {isRevealed ? '🙈 가리기' : '👁 보기'}
                      </button>
                      <button style={miniBtn} onClick={() => copyValue(pw, '비밀번호')}>복사</button>
                    </>
                  )}
                </div>

                {p.memo ? (
                  <>
                    <span style={fieldLabel}>메모</span>
                    <span style={{ color: '#52525b', whiteSpace: 'pre-wrap' }}>{p.memo}</span>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#18181b', color: '#fff', padding: '10px 18px', borderRadius: 20,
          fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 50,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const errBox = {
  background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
  padding: '9px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12,
};
const cardStyle = {
  border: '1px solid #e4e4e7', borderRadius: 12, padding: 14, background: '#fff',
};
const miniBtn = {
  padding: '4px 9px', border: '1px solid #e4e4e7', borderRadius: 6,
  background: '#fafafa', color: '#3f3f46', fontSize: 12, cursor: 'pointer',
};
const linkBtn = {
  padding: '3px 8px', border: 'none', borderRadius: 6,
  background: '#eff6ff', color: '#1d4ed8', fontSize: 12, cursor: 'pointer',
};
const fieldLabel = { color: '#a1a1aa', fontSize: 13, paddingTop: 2 };
const fieldRow = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
