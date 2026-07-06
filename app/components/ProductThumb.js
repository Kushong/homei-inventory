'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

// 상세페이지 대표 이미지: 클릭·붙여넣기·드래그로 즉시 교체 → products.image_url 갱신
export default function ProductThumb({ productId, imageUrl, editable }) {
  const supabase = createClient();
  const router = useRouter();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
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
        const path = `products/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const { error: dbErr } = await supabase
          .from('products')
          .update({ image_url: data.publicUrl })
          .eq('id', productId);
        if (dbErr) throw dbErr;

        router.refresh();
      } catch (e) {
        setErr('업로드 실패: ' + (e?.message || String(e)));
      } finally {
        setBusy(false);
      }
    },
    [productId, router, supabase]
  );

  // 페이지 어디서든 Ctrl/⌘+V 로 붙여넣기 (단, 입력창에 타이핑 중이면 무시)
  useEffect(() => {
    if (!editable) return;
    function onPaste(e) {
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      const item = [...(e.clipboardData?.items || [])].find((i) =>
        i.type.startsWith('image/')
      );
      if (item) {
        e.preventDefault();
        handleFile(item.getAsFile());
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [editable, handleFile]);

  const box = {
    position: 'relative',
    width: 72,
    height: 72,
    borderRadius: 14,
    border: '1px solid var(--line)',
    background: 'var(--line-2)',
    overflow: 'hidden',
    flexShrink: 0,
  };
  const imgStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
  const phStyle = {
    width: '100%', height: '100%', display: 'grid', placeItems: 'center',
    color: 'var(--faint)', fontWeight: 700, fontSize: 11,
  };

  // 편집 권한 없으면 정적 썸네일
  if (!editable) {
    return (
      <div style={box}>
        {imageUrl ? <img src={imageUrl} alt="" style={imgStyle} /> : <div style={phStyle}>IMG</div>}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title="클릭·붙여넣기·드래그로 이미지 변경"
      style={{
        ...box,
        cursor: busy ? 'progress' : 'pointer',
        borderColor: hover ? 'var(--brand)' : 'var(--line)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !busy) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFile(f);
      }}
    >
      {imageUrl ? <img src={imageUrl} alt="" style={imgStyle} /> : <div style={phStyle}>IMG</div>}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(20,22,26,.62)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          textAlign: 'center',
          padding: '3px 0',
          opacity: hover || busy ? 1 : 0,
          transition: 'opacity .12s',
        }}
      >
        {busy ? '처리 중…' : '변경'}
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

      {err && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            whiteSpace: 'nowrap',
            color: 'var(--danger)',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {err}
        </div>
      )}
    </div>
  );
}
