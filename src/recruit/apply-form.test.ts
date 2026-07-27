import { describe, it, expect } from 'vitest';
import {
  resolveApplyForm,
  DEFAULT_APPLY_FORM,
  FIELD_KEYS,
  linesToList,
  listToLines,
} from './apply-form';

describe('지원서 양식 설정 정규화', () => {
  it('저장된 값이 없으면 기본값을 준다', () => {
    expect(resolveApplyForm(null)).toEqual(DEFAULT_APPLY_FORM);
    expect(resolveApplyForm(undefined)).toEqual(DEFAULT_APPLY_FORM);
    expect(resolveApplyForm({})).toEqual(DEFAULT_APPLY_FORM);
  });

  it('어떤 입력이 와도 모든 문항 설정이 채워져 있다', () => {
    const r = resolveApplyForm({ fields: { name: { label: '성함' } } });
    for (const k of FIELD_KEYS) {
      expect(r.fields[k]).toBeDefined();
      expect(typeof r.fields[k].label).toBe('string');
      expect(typeof r.fields[k].required).toBe('boolean');
    }
    // 지정한 것만 바뀌고 나머지는 기본값 유지
    expect(r.fields.name.label).toBe('성함');
    expect(r.fields.email.label).toBe(DEFAULT_APPLY_FORM.fields.email.label);
  });

  it('문항 제목을 비우면 "그 항목을 받지 않는다"는 뜻으로 존중한다', () => {
    const r = resolveApplyForm({ fields: { englishName: { label: '' } } });
    expect(r.fields.englishName.label).toBe('');
    // null 은 미설정이므로 기본값
    expect(resolveApplyForm({ fields: { englishName: { label: null } } }).fields.englishName.label).toBe(
      DEFAULT_APPLY_FORM.fields.englishName.label
    );
  });

  it('안내 문구의 줄바꿈을 보존한다', () => {
    const desc = '첫 줄\n둘째 줄';
    expect(resolveApplyForm({ fields: { email: { description: desc } } }).fields.email.description).toBe(desc);
    // 기본값에도 여러 줄 안내가 들어 있다
    expect(DEFAULT_APPLY_FORM.fields.email.description).toContain('\n');
  });

  it('지망 팀은 운영진 팀 목록과 별개다', () => {
    expect(DEFAULT_APPLY_FORM.wishTeamOptions).toEqual(['1팀', '2팀', '3팀', '4팀', '5팀']);
    expect(resolveApplyForm({ wishTeamOptions: ['가팀', '나팀'] }).wishTeamOptions).toEqual(['가팀', '나팀']);
  });

  it('선택지의 공백·빈 항목은 걸러내고, 전부 비면 기본값으로 되돌린다', () => {
    expect(resolveApplyForm({ genderOptions: ['  남 ', '', '   '] }).genderOptions).toEqual(['남']);
    expect(resolveApplyForm({ genderOptions: [] }).genderOptions).toEqual(DEFAULT_APPLY_FORM.genderOptions);
  });

  it('2순위 추가 선택지와 가치관 주제는 비워 두는 것도 정상이다', () => {
    // 이 둘은 "없음"이 유효한 설정이라 기본값으로 되돌리지 않는다.
    expect(resolveApplyForm({ wishTeam2ExtraOptions: [] }).wishTeam2ExtraOptions).toEqual([]);
    expect(resolveApplyForm({ essayValuesTopics: [] }).essayValuesTopics).toEqual([]);
  });

  it('깨진 값이 와도 완전한 설정을 돌려준다', () => {
    const r = resolveApplyForm({ otAttendOptions: 'not-an-array', fields: 'nope' });
    expect(r.otAttendOptions).toEqual(DEFAULT_APPLY_FORM.otAttendOptions);
    expect(r.fields.name.label).toBe(DEFAULT_APPLY_FORM.fields.name.label);
  });

  it('비대면 면접은 선택지가 아니라 체크박스 문구 하나다', () => {
    expect(DEFAULT_APPLY_FORM.remoteInterviewCheckboxLabel).toBe('비대면 면접 희망');
    expect(DEFAULT_APPLY_FORM.fields.remoteInterview.required).toBe(false);
  });

  it('옛 형식(essayIntroLabel/essayValuesLabel)으로 저장된 문구를 이어받는다', () => {
    // fields 가 생기기 전 저장된 기수가 실제로 있다. 회장단이 직접 쓴 문구라 버리면 안 된다.
    const r = resolveApplyForm({
      essayIntroLabel: '지원동기를 적어 주세요',
      essayValuesLabel: '주제 하나를 골라 답해 주세요',
      genderOptions: ['여성', '남성', '기타'],
    });
    expect(r.fields.essayIntro.label).toBe('지원동기를 적어 주세요');
    expect(r.fields.essayValues.label).toBe('주제 하나를 골라 답해 주세요');
    expect(r.genderOptions).toEqual(['여성', '남성', '기타']);
  });

  it('새 형식으로 저장된 값이 옛 값보다 우선한다', () => {
    const r = resolveApplyForm({
      essayIntroLabel: '옛 문구',
      fields: { essayIntro: { label: '새 문구' } },
    });
    expect(r.fields.essayIntro.label).toBe('새 문구');
  });

  it('줄바꿈 편집 문자열과 배열을 오간다', () => {
    expect(linesToList('가\n 나 \n\n다\n')).toEqual(['가', '나', '다']);
    expect(listToLines(['가', '나'])).toBe('가\n나');
  });
});
