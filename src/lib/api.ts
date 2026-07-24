// 클라이언트용 fetch 헬퍼. 쿠키 세션이므로 credentials 기본 동봉(same-origin).
export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T & { error?: string; retryAfter?: number; message?: string };
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data: (data ?? {}) as ApiResult<T>['data'] };
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  method: 'POST' | 'PATCH' | 'PUT' = 'POST'
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}

export async function apiGet<T = unknown>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  return parse<T>(res);
}

// 서버 에러 코드 → 한국어 메시지.
export function errorMessage(code: string | undefined, fallback = '오류가 발생했습니다.'): string {
  const map: Record<string, string> = {
    invalid_email: '이메일 형식이 올바르지 않습니다.',
    invalid_join_code: '가입코드가 올바르지 않습니다.',
    already_registered: '이미 가입된 이메일입니다. 로그인해 주세요.',
    otp_invalid: '인증 코드가 올바르지 않습니다.',
    otp_expired: '인증 코드가 만료되었습니다. 재발급해 주세요.',
    otp_too_many_attempts: '실패가 많습니다. 코드를 재발급해 주세요.',
    otp_not_found: '유효한 인증 코드가 없습니다. 재발급해 주세요.',
    cooldown: '잠시 후 다시 시도해 주세요.',
    forbidden: '권한이 없습니다.',
    unauthorized: '로그인이 필요합니다.',
    server_misconfigured: '서버 설정 오류입니다. 운영진에게 문의해 주세요.',
    team_not_found: '팀을 찾을 수 없습니다.',
    user_not_found: '해당 이메일의 가입 회원이 없습니다. 먼저 가입해야 지정할 수 있습니다.',
    user_inactive: '활성 멤버십이 없는 회원입니다.',
    missing_user: '대상 회원이 지정되지 않았습니다.',
    duplicate_menuid: '이미 등록된 menuid 입니다. 기존 게시판을 수정하세요.',
    missing_team: '봉사 공지는 팀을 선택해야 합니다.',
    missing_title: '제목을 입력해 주세요.',
    missing_name: '양식 이름을 입력해 주세요.',
    missing_board: '게시판을 선택해 주세요.',
    self_forbidden: '본인 계정은 여기서 변경할 수 없어요.',
    sysadmin_only: '시스템관리자 역할은 시스템관리자만 변경할 수 있어요.',
    last_sysadmin: '마지막 시스템관리자는 강등·비활성화할 수 없어요.',
    last_privileged: '마지막 회장단이에요. 다른 회장단을 먼저 지정한 뒤 변경해 주세요(전원 잠금 방지).',
    no_membership: '활성 멤버십이 없는 회원이에요.',
    not_found: '대상을 찾을 수 없어요.',
    bad_role: '올바르지 않은 역할입니다.',
    no_occurrences: '발행 시각(또는 봉사 일자)을 최소 1개 입력하세요.',
    // 보안 게이트 관련(서버가 거부한 이유를 사람 말로).
    rate_limited: '시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
    too_long: '입력이 너무 깁니다. 길이를 줄여 주세요.',
    too_many_occurrences: '한 번에 만들 수 있는 예약 수를 넘었습니다. 나눠서 만들어 주세요.',
    too_many_entries: '명단이 너무 많습니다. 인원을 줄여 주세요.',
    board_not_writable:
      '봇이 글을 쓸 수 없는 게시판입니다. 게시판 관리에서 활성 상태와 "봇 쓰기 허용"을 확인해 주세요.',
    bad_menuid: 'menuid 는 1 이상의 정수여야 합니다.',
    bad_owner_type: '올바르지 않은 소유 구분입니다.',
    invalid_join_code_format: '가입코드는 6자 이상의 영문 대문자와 숫자로만 만들 수 있습니다.',
  };
  return (code && map[code]) || fallback;
}
