import { describe, it, expect } from 'vitest';
import { pickInterviewLink, normalizeInterviewLink } from './interview-link';

// 이 규칙이 무너지면 면접 당일 지원자가 들어갈 방 주소를 못 받는다(09-RECRUIT-DESIGN §6-7).
describe('면접 링크 고르기', () => {
  it('개인 링크가 있으면 개인 링크가 이긴다', () => {
    expect(pickInterviewLink('https://zoom.us/j/1', 'https://meet.google.com/a')).toBe(
      'https://zoom.us/j/1'
    );
  });

  it('개인 링크가 없으면 배정된 조의 링크를 쓴다', () => {
    expect(pickInterviewLink(null, 'https://meet.google.com/ztq-mvcc-nrm')).toBe(
      'https://meet.google.com/ztq-mvcc-nrm'
    );
  });

  it('개인 링크가 빈 문자열·공백이어도 조 링크로 넘어간다', () => {
    expect(pickInterviewLink('   ', 'https://meet.google.com/a')).toBe('https://meet.google.com/a');
  });

  it('둘 다 없으면 null — 화면은 링크 줄 자체를 지운다', () => {
    expect(pickInterviewLink(null, null)).toBeNull();
    expect(pickInterviewLink(undefined, '')).toBeNull();
  });
});

describe('붙여 넣은 링크 다듬기', () => {
  // 실제로 33기 A조 링크가 이 꼴이었다. 그대로 href 에 넣으면 우리 사이트 하위 경로로 간다.
  it('스킴이 없으면 https 를 붙인다', () => {
    expect(normalizeInterviewLink('meet.google.com/vig-dcfn-ssw')).toBe(
      'https://meet.google.com/vig-dcfn-ssw'
    );
  });

  it('앞뒤 공백을 떼고, 이미 스킴이 있으면 그대로 둔다', () => {
    expect(normalizeInterviewLink('  https://zoom.us/j/123  ')).toBe('https://zoom.us/j/123');
    expect(normalizeInterviewLink('http://zoom.us/j/123')).toBe('http://zoom.us/j/123');
  });

  it('http·https 가 아닌 스킴은 버린다 — href 로 그대로 나가는 값이다', () => {
    expect(normalizeInterviewLink('javascript:alert(1)')).toBeNull();
    expect(normalizeInterviewLink('data:text/html,<script>')).toBeNull();
  });

  it('주소로 읽을 수 없으면 버린다', () => {
    expect(normalizeInterviewLink('링크 미정')).toBeNull();
    expect(normalizeInterviewLink('')).toBeNull();
  });
});
