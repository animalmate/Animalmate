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
  };
  return (code && map[code]) || fallback;
}
