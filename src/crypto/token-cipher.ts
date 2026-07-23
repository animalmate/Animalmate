// refresh token 암호화 — AES-256-GCM(인증 암호화). TOKEN_ENCRYPTION_KEY 로 암·복호화.
// 저장 포맷: base64( iv(12) | authTag(16) | ciphertext ). 키는 32바이트(hex 64자 또는 base64).
// 순수 함수(키를 인자로 받음) → 단위 테스트 가능. 평문 토큰은 절대 로그·커밋 금지(규칙 #4).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** 32바이트 키 문자열(hex 64자 또는 base64)을 Buffer 로 디코드. */
export function decodeKey(raw: string): Buffer {
  const s = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  const b = Buffer.from(s, 'base64');
  if (b.length === 32) return b;
  throw new Error('TOKEN_ENCRYPTION_KEY 는 32바이트여야 합니다(hex 64자 또는 base64 32바이트).');
}

/** 환경변수에서 암호화 키 로드. */
export function loadKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY 가 설정되지 않았습니다(서버 환경변수).');
  return decodeKey(raw);
}

export function encryptToken(plaintext: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('키는 32바이트여야 합니다.');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptToken(payloadB64: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('키는 32바이트여야 합니다.');
  const buf = Buffer.from(payloadB64, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('암호문 형식이 올바르지 않습니다.');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** 새 32바이트 키를 base64 로 생성(초기 셋업·키 로테이션용). */
export function generateKeyBase64(): string {
  return randomBytes(32).toString('base64');
}
