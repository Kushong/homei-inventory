import crypto from 'crypto';

// Vercel 환경변수 PRIVATE_GATE_SECRET 를 넣으면 이 값을 대체함(권장, 필수 아님)
const SECRET = process.env.PRIVATE_GATE_SECRET || 'homei-private-gate-fallback-2025';

export const PRIVATE_COOKIE = 'homei_private_unlock';
export const UNLOCK_HOURS = 8;

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
}

// "<만료ms>.<hmac>" 형태 토큰 생성
export function makeUnlockToken(ms) {
  const exp = String(ms);
  return exp + '.' + sign(exp);
}

// 토큰이 위조되지 않았고 아직 만료 전이면 true
export function isUnlockTokenValid(token) {
  if (!token || typeof token !== 'string') return false;
  const i = token.indexOf('.');
  if (i < 0) return false;
  const exp = token.slice(0, i);
  const mac = token.slice(i + 1);
  if (sign(exp) !== mac) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return false;
  return Date.now() < expNum;
}
