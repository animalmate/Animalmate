import { describe, it, expect } from 'vitest';
import { resolveApplyForm, DEFAULT_APPLY_FORM, linesToList, listToLines } from './apply-form';

describe('지원서 양식 설정 정규화', () => {
  it('저장된 값이 없으면 기본값을 준다', () => {
    expect(resolveApplyForm(null)).toEqual(DEFAULT_APPLY_FORM);
    expect(resolveApplyForm(undefined)).toEqual(DEFAULT_APPLY_FORM);
    expect(resolveApplyForm({})).toEqual(DEFAULT_APPLY_FORM);
  });

  it('저장된 선택지를 그대로 쓴다', () => {
    const r = resolveApplyForm({ otAttendOptions: ['참석', '불참', '미정'] });
    expect(r.otAttendOptions).toEqual(['참석', '불참', '미정']);
    // 지정하지 않은 항목은 기본값 유지
    expect(r.genderOptions).toEqual(DEFAULT_APPLY_FORM.genderOptions);
  });

  it('공백·빈 항목은 걸러내고, 전부 비면 기본값으로 되돌린다', () => {
    expect(resolveApplyForm({ genderOptions: ['  여성 ', '', '   '] }).genderOptions).toEqual(['여성']);
    expect(resolveApplyForm({ genderOptions: ['', '  '] }).genderOptions).toEqual(
      DEFAULT_APPLY_FORM.genderOptions
    );
  });

  it('깨진 값이 와도 완전한 설정을 돌려준다', () => {
    const r = resolveApplyForm({ otAttendOptions: 'not-an-array', essayIntroLabel: 123 });
    expect(r.otAttendOptions).toEqual(DEFAULT_APPLY_FORM.otAttendOptions);
    expect(r.essayIntroLabel).toBe('123');
  });

  it('빈 문자열 문항은 "그 문항을 받지 않는다"는 뜻으로 존중한다', () => {
    expect(resolveApplyForm({ essayValuesLabel: '' }).essayValuesLabel).toBe('');
    // null 은 미설정이므로 기본값
    expect(resolveApplyForm({ essayValuesLabel: null }).essayValuesLabel).toBe(
      DEFAULT_APPLY_FORM.essayValuesLabel
    );
  });

  it('줄바꿈 편집 문자열과 배열을 오간다', () => {
    expect(linesToList('가\n 나 \n\n다\n')).toEqual(['가', '나', '다']);
    expect(listToLines(['가', '나'])).toBe('가\n나');
  });
});
