// 결과 조회 실패 카운터의 식별자 — **조회 대상(이름)** 기준. 순수 모듈(단위 테스트 대상).
//
// 왜 IP 가 아니라 이름인가(2026-07-31, 07-DECISIONS 80):
// 열거 공격은 "특정인의 전화번호를 맞히는" 일이다. 대상 단위로 세면
//  ① IP 를 바꿔 가며 하는 시도까지 한 통에 모여 막힌다(IP 기준보다 강하다).
//  ② 같은 IP 뒤 서로 다른 사람은 서로의 예산을 깎지 않는다 — 발표 직후 한 공인 IP 로
//     수십 명이 몰려도, 남의 오타 때문에 내가 잠기지 않는다.
//
// 왜 원문이 아니라 HMAC 인가: 조회 실패 입력은 곧 **비지원자의 개인정보**일 수 있어
// 그대로 저장하지 않기로 했다(결정 25). 그렇다고 무염 해시를 쓰면 한국 이름은 후보가 적어
// 사전 대입으로 바로 되돌아간다 — 서버 비밀키로 HMAC 해야 저장된 값이 이름을 되돌려주지 않는다.

import { createHmac } from 'node:crypto';

/** 다른 용도의 HMAC 과 값이 겹치지 않게 하는 도메인 구분자(같은 비밀키를 쓰므로 필요하다). */
const DOMAIN = 'recruit-lookup-fail:v1:';

/**
 * 이름 → 실패 카운터 식별자. 같은 이름이면 항상 같은 값, 다른 이름이면 다른 값.
 * 결과에 이름 원문이 남지 않는다.
 *
 * 이름 정규화는 DB 매칭(`name.trim()`)과 같게 맞춘다 — 대조하는 값과 세는 값이 어긋나면
 * 공백 하나로 카운터를 우회할 수 있다.
 */
export function lookupFailKey(name: string, secret: string): string {
  if (!secret) throw new Error('SESSION_SECRET 가 필요합니다(조회 실패 카운터 해시).');
  return createHmac('sha256', secret).update(`${DOMAIN}${name.trim()}`).digest('base64url').slice(0, 32);
}
