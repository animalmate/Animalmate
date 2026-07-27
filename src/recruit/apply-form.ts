// F9 공개 지원서 양식 설정 — 순수 로직(부수효과·DB 접근 없음).
//
// 지원서의 선택지와 자기소개서 문항은 기수마다 달라진다(질문을 바꾸거나, OT 일정이 없어서
// 참석 여부를 안 받거나). 예전에는 이 값들이 화면 코드에 박혀 있어서 회장단이 바꾸려면
// 배포가 필요했다. 이제 recruit_cohorts.apply_form(jsonb)에 저장하고
// "0. 공고·마감 설정" 화면에서 고친다.

export interface ApplyFormConfig {
  genderOptions: string[];
  applyRouteOptions: string[];
  otAttendOptions: string[];
  remoteInterviewOptions: string[];
  /** 자기소개서 1번 문항. 빈 문자열이면 그 문항을 아예 받지 않는다. */
  essayIntroLabel: string;
  /** 자기소개서 2번 문항. 빈 문자열이면 그 문항을 아예 받지 않는다. */
  essayValuesLabel: string;
}

/** 설정을 저장한 적 없는 기수에 쓰는 기본값(기존 화면에 있던 값 그대로). */
export const DEFAULT_APPLY_FORM: ApplyFormConfig = {
  genderOptions: ['여성', '남성', '기타'],
  applyRouteOptions: ['에브리타임', '인스타그램', '지인 소개', '학교 게시판', '동아리 박람회'],
  otAttendOptions: ['참석 가능', '불참'],
  remoteInterviewOptions: ['대면 면접 희망', '비대면 면접 희망'],
  essayIntroLabel: '자기소개와 동물에 대한 생각',
  essayValuesLabel: '지원 동기와 가치관',
};

const cleanList = (v: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(v)) return fallback;
  const items = v.map((x) => String(x).trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
};

const cleanText = (v: unknown, fallback: string): string => {
  // 저장된 적이 없으면(undefined/null) 기본값, 빈 문자열이면 "문항 사용 안 함"으로 존중한다.
  if (v === undefined || v === null) return fallback;
  return String(v).trim();
};

/**
 * DB 의 jsonb 값을 화면이 바로 쓸 수 있는 설정으로 정규화한다.
 * 값이 없거나 깨져 있어도 항상 완전한 설정을 돌려준다 — 지원서 화면이 빈 셀렉트로 뜨면 안 된다.
 */
export function resolveApplyForm(raw: unknown): ApplyFormConfig {
  const o = (raw ?? {}) as Partial<Record<keyof ApplyFormConfig, unknown>>;
  return {
    genderOptions: cleanList(o.genderOptions, DEFAULT_APPLY_FORM.genderOptions),
    applyRouteOptions: cleanList(o.applyRouteOptions, DEFAULT_APPLY_FORM.applyRouteOptions),
    otAttendOptions: cleanList(o.otAttendOptions, DEFAULT_APPLY_FORM.otAttendOptions),
    remoteInterviewOptions: cleanList(
      o.remoteInterviewOptions,
      DEFAULT_APPLY_FORM.remoteInterviewOptions
    ),
    essayIntroLabel: cleanText(o.essayIntroLabel, DEFAULT_APPLY_FORM.essayIntroLabel),
    essayValuesLabel: cleanText(o.essayValuesLabel, DEFAULT_APPLY_FORM.essayValuesLabel),
  };
}

/** 줄바꿈으로 구분한 편집 문자열 ↔ 선택지 배열. 설정 화면에서 쓴다. */
export const linesToList = (text: string): string[] =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

export const listToLines = (list: string[]): string => list.join('\n');
