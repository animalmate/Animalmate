// F9 공개 지원서 양식 설정 — 순수 로직(부수효과·DB 접근 없음).
//
// 기수마다 문항 문구·안내·선택지가 달라진다(면접 날짜가 문항에 들어가고, 팀 집결지가 바뀌고,
// OT 유무가 달라진다). 그래서 화면 코드에 박지 않고 recruit_cohorts.apply_form(jsonb)에 저장하고
// "0. 공고·마감 설정"에서 회장단이 고친다.
//
// 기본값은 실제 구글폼(33기 지원서)을 그대로 옮긴 것이다.
//
// ⚠ 항목 자체(어떤 필드를 받는가)는 고정이다 — recruit_applicants 의 컬럼과 1:1 로 묶여 있고
//   심사·집계 화면이 그 컬럼을 읽기 때문이다. 바꿀 수 있는 것은 문구·안내·선택지·필수 여부다.

import { shortTeamName } from './team-name';

/** 문항 하나의 표시 설정. */
export interface FieldConfig {
  /** 문항 제목. 비우면 그 문항을 지원서에서 뺀다(이름·전화번호는 제외 — 항상 받는다). */
  label: string;
  /** 문항 아래 안내 문구. 줄바꿈 그대로 보인다. */
  description: string;
  required: boolean;
}

/** 설정 가능한 문항 키 — recruit_applicants 컬럼과 대응한다. */
export const FIELD_KEYS = [
  'name',
  'gender',
  'birthDate',
  'phone',
  'school',
  'department',
  'email',
  'applyRoute',
  'essayIntro',
  'essayValues',
  'otherActivities',
  'expectedFrequency',
  'wishTeam1',
  'wishTeam2',
  'nearStation',
  'otAttend',
  'remoteInterview',
  'englishName',
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export interface ApplyFormConfig {
  fields: Record<FieldKey, FieldConfig>;
  genderOptions: string[];
  applyRouteOptions: string[];
  expectedFrequencyOptions: string[];
  /**
   * 지망 팀 목록. 회원 관리의 teams 테이블(기획팀·홍보팀 등 운영진 조직)과는 별개다 —
   * 여기는 신입이 배정되는 봉사 팀이다.
   *
   * **팀 이름만 넣는다**("1팀", "2팀" …). 고른 값이 그대로 지원자 행에 저장돼 심사·집계 화면의
   * 팀 배지가 되기 때문이다. 지역·집결지 안내는 아래 teamDescription 이 맡는다.
   */
  wishTeamOptions: string[];
  /**
   * 팀 설명. 지원서의 희망 팀 문항 위에 줄바꿈 그대로 보인다
   * (예: "1팀 — 강남 (집결지: 강남역)"). 비워 두면 아무것도 나오지 않는다.
   */
  teamDescription: string;
  /** 가치관 문항에서 고르는 주제. 지원자는 주제 하나를 고르고 장문으로 답한다. */
  essayValuesTopics: string[];
  otAttendOptions: string[];
  /**
   * 비대면 면접은 라디오가 아니라 **체크박스**다 — 체크하면 비대면 희망, 안 하면 대면.
   * 여기 값이 체크했을 때 저장되는 문구가 된다.
   */
  remoteInterviewCheckboxLabel: string;
}

const f = (label: string, description = '', required = true): FieldConfig => ({
  label,
  description,
  required,
});

export const DEFAULT_APPLY_FORM: ApplyFormConfig = {
  fields: {
    name: f('이름'),
    gender: f('성별'),
    birthDate: f('생년월일(YYYY.MM.DD)'),
    phone: f('전화번호', '"-" 없이 숫자만 입력'),
    school: f('학교'),
    department: f('학과'),
    email: f(
      '이메일',
      '애니멀메이트 공식 네이버 카페 가입용이므로 네이버 메일로 기재.\n1차 서류 탈락자의 경우 이메일, 합격자의 경우 문자로 공지됩니다.'
    ),
    applyRoute: f('지원 경로'),
    essayIntro: f(
      '자기소개',
      '지원동기 및 활동 포부를 자유롭게 작성해주세요.\n해당 항목은 지원자를 이해하기 위한 참고 자료로 활용되며, 서류 검토 및 면접 질문에 일부 반영될 수 있습니다.'
    ),
    essayValues: f('가치관 확인', '아래 항목 중 한 가지를 선택하여 본인의 생각을 자유롭게 작성해주세요.'),
    otherActivities: f(
      '다른 대외 활동 또는 아르바이트 등의 활동 계획 여부',
      '애니멀메이트의 대부분의 활동은 주로 주말에 진행됩니다.\n활동 일정 파악을 위해 주말에 진행 중이거나 예정된 대외활동, 아르바이트 등 정기 일정이 있다면 작성해주세요.'
    ),
    expectedFrequency: f(
      '예상 활동 참여 주기',
      '애니멀메이트는 격주로 진행되는 봉사 활동뿐만 아니라, 정기 행사 및 번개 모임 등 친목 도모 활동 또한 진행하고 있습니다.\n*애니멀메이트는 어떠한 행사나 봉사도 참여를 의무화하지 않고 있습니다.'
    ),
    wishTeam1: f('희망 팀 조사(1순위)'),
    wishTeam2: f(
      '희망 팀 조사(2순위)',
      '애니멀메이트는 지원자 상황에 따라 2순위 팀에 배치되실 수 있습니다.\n팀은 소속 팀 파악 및 인원 구분을 위한 배치로 타 팀 봉사 신청과 참여에 별도의 제약은 두고 있지 않습니다.'
    ),
    nearStation: f('주소', '거주지를 기준으로 가장 가까운 지하철역만 작성해주세요.'),
    otAttend: f('OT 참가 여부', 'OT 일정과 안내를 여기에 적어 주세요.'),
    remoteInterview: f(
      '비대면 면접 여부(희망자만 체크)',
      '비대면 면접 일정과 유의사항을 여기에 적어 주세요.',
      false
    ),
    englishName: f('영문 이름', '합격 시 외부 단체 가입에 필요한 내용으로, 불합격 시 폐기됩니다.', false),
  },
  genderOptions: ['남', '여'],
  applyRouteOptions: [
    '지인 소개',
    '에브리타임',
    '캠퍼스픽',
    '인스타그램',
    '외부봉사 경험',
    'KT&G복지재단 협력동아리',
    '기타',
  ],
  expectedFrequencyOptions: ['매주 1회', '격주 1회', '달에 1번', '한 학기에 1번', '기타'],
  wishTeamOptions: ['1팀', '2팀', '3팀', '4팀', '5팀'],
  teamDescription: '',
  essayValuesTopics: [
    '국내 유기견 실태',
    '강아지 번식장 문제',
    '캣맘/캣대디 이슈',
    '본인의 동물 관련 경험',
    '국내 유기 동물 관련 인프라',
  ],
  otAttendOptions: ['예', '아니오'],
  remoteInterviewCheckboxLabel: '비대면 면접 희망',
};

const cleanList = (v: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(v)) return fallback;
  const items = v.map((x) => String(x).trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
};

/** 저장된 적이 없으면(undefined/null) 기본값, 빈 문자열이면 "문항 사용 안 함"으로 존중한다. */
const cleanText = (v: unknown, fallback: string): string =>
  v === undefined || v === null ? fallback : String(v);

const cleanField = (v: unknown, fallback: FieldConfig): FieldConfig => {
  const o = (v ?? {}) as Partial<FieldConfig>;
  return {
    label: cleanText(o.label, fallback.label),
    description: cleanText(o.description, fallback.description),
    required: typeof o.required === 'boolean' ? o.required : fallback.required,
  };
};

/**
 * DB 의 jsonb 값을 화면이 바로 쓸 수 있는 설정으로 정규화한다.
 * 값이 없거나 깨져 있어도 항상 완전한 설정을 돌려준다 — 지원서가 빈 셀렉트로 뜨면 안 된다.
 */
export function resolveApplyForm(raw: unknown): ApplyFormConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rawFields = (o.fields ?? {}) as Record<string, unknown>;

  const fields = {} as Record<FieldKey, FieldConfig>;
  for (const k of FIELD_KEYS) {
    fields[k] = cleanField(rawFields[k], DEFAULT_APPLY_FORM.fields[k]);
  }

  // 옛 형식 이어받기: 문항별 설정(fields)이 생기기 전에는 자기소개·가치관 문구를
  // essayIntroLabel / essayValuesLabel 로 저장했다. 회장단이 직접 쓴 문구라 버리지 않는다.
  // 새 형식으로 한 번이라도 저장하면(fields 에 값이 생기면) 그쪽이 이긴다.
  if (rawFields.essayIntro === undefined && typeof o.essayIntroLabel === 'string' && o.essayIntroLabel.trim()) {
    fields.essayIntro = { ...fields.essayIntro, label: o.essayIntroLabel };
  }
  if (rawFields.essayValues === undefined && typeof o.essayValuesLabel === 'string' && o.essayValuesLabel.trim()) {
    fields.essayValues = { ...fields.essayValues, label: o.essayValuesLabel };
  }

  // 지망 팀 선택지에서 지역 꼬리를 떼어 팀 이름만 남긴다("1팀 - 강남(집결지 강남역)" → "1팀").
  // 고른 값이 그대로 지원자 행에 저장돼 심사·집계 화면의 팀 배지가 되기 때문이다.
  const rawTeams = cleanList(o.wishTeamOptions, DEFAULT_APPLY_FORM.wishTeamOptions);
  const shortTeams = rawTeams.map((t) => shortTeamName(t) ?? t);
  // 줄였더니 이름이 겹치면(1팀 - 강남 / 1팀 - 송파) 팀 하나가 사라진다. 그럴 땐 손대지 않는다.
  const teamsCollapsed = new Set(shortTeams).size !== shortTeams.length;
  const shortened = !teamsCollapsed && shortTeams.some((t, i) => t !== rawTeams[i]);

  return {
    fields,
    genderOptions: cleanList(o.genderOptions, DEFAULT_APPLY_FORM.genderOptions),
    applyRouteOptions: cleanList(o.applyRouteOptions, DEFAULT_APPLY_FORM.applyRouteOptions),
    expectedFrequencyOptions: cleanList(
      o.expectedFrequencyOptions,
      DEFAULT_APPLY_FORM.expectedFrequencyOptions
    ),
    wishTeamOptions: teamsCollapsed ? rawTeams : shortTeams,
    // 옛 형식 이어받기: 지역·집결지를 선택지 문구에 붙여 저장한 기수가 있다. 회장단이 직접 쓴
    // 안내라 버리지 않고 '팀 설명'으로 옮긴다 — 새로 저장한 팀 설명이 있으면 그쪽이 이긴다.
    teamDescription: cleanText(o.teamDescription, shortened ? rawTeams.join('\n') : ''),
    essayValuesTopics: Array.isArray(o.essayValuesTopics)
      ? (o.essayValuesTopics as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : DEFAULT_APPLY_FORM.essayValuesTopics,
    otAttendOptions: cleanList(o.otAttendOptions, DEFAULT_APPLY_FORM.otAttendOptions),
    remoteInterviewCheckboxLabel: cleanText(
      o.remoteInterviewCheckboxLabel,
      DEFAULT_APPLY_FORM.remoteInterviewCheckboxLabel
    ),
  };
}

/** 줄바꿈으로 구분한 편집 문자열 ↔ 선택지 배열. 설정 화면에서 쓴다. */
export const linesToList = (text: string): string[] =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

export const listToLines = (list: string[]): string => list.join('\n');
