import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function PrivateHomePage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#18181b', margin: '0 0 4px' }}>
        개인 작업실
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#71717a' }}>
        어느 컴퓨터에서 로그인해도 여기 저장한 메모·자료가 그대로 있어요.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        <Link
          href="/private/notes"
          style={{
            display: 'block',
            padding: 18,
            borderRadius: 12,
            border: '1px solid #e4e4e7',
            background: '#fff',
            textDecoration: 'none',
            color: '#27272a',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>📝</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>메모</div>
          <div style={{ fontSize: 13, color: '#71717a' }}>자유롭게 적어두는 메모장</div>
        </Link>

        <div
          style={{
            padding: 18,
            borderRadius: 12,
            border: '1px dashed #e4e4e7',
            background: '#fafafa',
            color: '#a1a1aa',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>할 일</div>
          <div style={{ fontSize: 13 }}>준비 중</div>
        </div>
      </div>
    </div>
  );
}
