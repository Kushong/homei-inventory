'use client';

import { useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const BUCKET = 'product-images';
const SIZE = 300;

// 파일 → 가운데 정사각형 크롭 → 300×300 JPEG Blob
function cropToSquare(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환 실패'))),
        'image/jpeg',
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없습니다'));
    };
    img.src = url;
  });
}

export default function ImageUploader({ value, onChange, folder = 'products', disabled }) {
  const supabase = createClient();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setErr('이미지 파일만 올릴 수 있습니다.');
        return;
      }
      setErr('');
      setBusy(true);
      try {
        const blob = await cropToSquare(file);
        const path = `${folder}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        onChange(data.publicUrl);
      } catch (e) {
        setErr('업로드 실패: ' + (e?.message || String(e)));
      } finally {
        setBusy(false);
      }
    },
    [folder, onChange, supabase]
  );

  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) =>
      i.type.startsWith('image/')
    );
    if (item) {
      e.preventDefault();
      handleFile(item.getAsFile());
    }
  }

  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="uploader">
      <div
        className={`up-zone${busy ? ' busy' : ''}`}
        tabIndex={0}
        role="button"
        aria-label="이미지 업로드"
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
      >
        {value ? (
          <img className="up-preview" src={value} alt="미리보기" />
        ) : (
          <div className="up-ph">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
            <span>클릭·붙여넣기·드래그</span>
          </div>
        )}
        {busy && <div className="up-busy">처리 중…</div>}
      </div>

      <div className="up-side">
        <button
          type="button"
          className="btn ghost sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          파일 선택
        </button>
        {value && (
          <button
            type="button"
            className="up-clear"
            disabled={busy}
            onClick={() => onChange('')}
          >
            제거
          </button>
        )}
        <p className="up-hint">가운데를 정사각형으로 잘라 300×300으로 저장됩니다.</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {err && <div className="up-err">{err}</div>}
    </div>
  );
}
