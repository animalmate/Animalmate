import { describe, it, expect } from 'vitest';
import { isCrossOriginWrite, type OriginCheckInput } from './csrf';

const SELF = 'https://animalmate.example';
const req = (over: Partial<OriginCheckInput> = {}): OriginCheckInput => ({
  method: 'POST',
  pathname: '/api/me',
  selfOrigin: SELF,
  origin: SELF,
  secFetchSite: 'same-origin',
  ...over,
});

describe('isCrossOriginWrite — 상태 변경 API 의 출처 검사', () => {
  it('우리 화면에서 보낸 요청은 통과한다', () => {
    expect(isCrossOriginWrite(req())).toBe(false);
    expect(isCrossOriginWrite(req({ secFetchSite: null }))).toBe(false); // Sec-Fetch-Site 를 안 보내는 브라우저
  });

  it('브라우저가 same-origin 이라고 하면 믿는다 — 프록시 뒤에서 selfOrigin 이 어긋나도 막지 않는다', () => {
    expect(isCrossOriginWrite(req({ selfOrigin: 'http://localhost:3000', origin: SELF, secFetchSite: 'same-origin' }))).toBe(false);
  });

  it('다른 사이트에서 온 쓰기는 막는다', () => {
    expect(isCrossOriginWrite(req({ origin: 'https://evil.example', secFetchSite: 'cross-site' }))).toBe(true);
    expect(isCrossOriginWrite(req({ origin: 'https://evil.example', secFetchSite: null }))).toBe(true);
  });

  it('같은 사이트의 다른 서브도메인도 막는다 — SameSite=Lax 가 쿠키를 실어 보내는 자리다', () => {
    expect(isCrossOriginWrite(req({ origin: 'https://other.animalmate.example', secFetchSite: 'same-site' }))).toBe(true);
  });

  it("'null' 오리진(샌드박스 iframe·file://)은 막는다", () => {
    expect(isCrossOriginWrite(req({ origin: 'null', secFetchSite: null }))).toBe(true);
  });

  it('읽기(GET·HEAD)는 검사하지 않는다', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isCrossOriginWrite(req({ method, origin: 'https://evil.example', secFetchSite: 'cross-site' }))).toBe(false);
    }
  });

  it('PUT·PATCH·DELETE 도 쓰기로 본다', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE', 'patch']) {
      expect(isCrossOriginWrite(req({ method, origin: 'https://evil.example', secFetchSite: 'cross-site' }))).toBe(true);
    }
  });

  it('크론은 검사하지 않는다 — pg_net 이 부르고 CRON_SECRET 이 지킨다', () => {
    expect(isCrossOriginWrite(req({ pathname: '/api/cron/publish', origin: null, secFetchSite: null }))).toBe(false);
    expect(isCrossOriginWrite(req({ pathname: '/api/cron/publish', origin: 'https://evil.example' }))).toBe(false);
  });

  it('브라우저가 아닌 호출(출처 헤더 없음)은 통과한다 — 피해자 쿠키가 실려 있지 않다', () => {
    expect(isCrossOriginWrite(req({ origin: null, secFetchSite: null }))).toBe(false);
  });

  it('API 가 아닌 경로는 대상이 아니다', () => {
    expect(isCrossOriginWrite(req({ pathname: '/login', origin: 'https://evil.example', secFetchSite: 'cross-site' }))).toBe(false);
  });
});
