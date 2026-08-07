'use client';

import React from 'react';
import { Field, Input } from '@/components/ui';
import {
  FIELD_KEYS,
  linesToList,
  listToLines,
  type ApplyFormConfig,
  type FieldKey,
} from '@/recruit/apply-form';

/** 화면에 보여줄 문항 이름(관리자가 어떤 항목인지 알아보게). 저장되는 문구와는 별개다. */
const FIELD_TITLES: Record<FieldKey, string> = {
  name: '이름',
  gender: '성별',
  birthDate: '생년월일',
  phone: '전화번호',
  school: '학교',
  department: '학과',
  email: '이메일',
  applyRoute: '지원 경로',
  essayIntro: '자기소개(장문)',
  essayValues: '가치관 확인(주제 선택 + 장문)',
  otherActivities: '다른 대외활동',
  expectedFrequency: '예상 참여 주기',
  wishTeam1: '희망 팀 1순위',
  wishTeam2: '희망 팀 2순위',
  nearStation: '주소(가까운 역)',
  otAttend: 'OT 참가 여부',
  remoteInterview: '비대면 면접(체크박스)',
  englishName: '영문 이름',
};

/** 이름·전화번호는 지원 결과 조회의 매칭 키라 끄거나 선택으로 바꿀 수 없다. */
const ALWAYS_ON: FieldKey[] = ['name', 'phone'];

/** 선택지 목록을 쓰는 문항과, 그 목록이 설정의 어느 키인지. */
const OPTION_LISTS: { key: keyof ApplyFormConfig; title: string; hint: string }[] = [
  { key: 'genderOptions', title: '성별 선택지', hint: '' },
  { key: 'applyRouteOptions', title: '지원 경로 선택지', hint: '' },
  { key: 'expectedFrequencyOptions', title: '예상 참여 주기 선택지', hint: '' },
  { key: 'otAttendOptions', title: 'OT 참가 여부 선택지', hint: '' },
  { key: 'essayValuesTopics', title: '가치관 문항 주제 목록', hint: '지원자가 이 중 하나를 골라 답합니다.' },
];

const taCls =
  'w-full rounded-xl border-[1.5px] border-ink-200 bg-white p-3 text-[13px] font-sans leading-relaxed text-ink-900 outline-none focus:border-blue-500';

export function ApplyFormEditor({
  value,
  onChange,
}: {
  value: ApplyFormConfig;
  onChange: (next: ApplyFormConfig) => void;
}) {
  const setField = (k: FieldKey, patch: Partial<ApplyFormConfig['fields'][FieldKey]>) =>
    onChange({ ...value, fields: { ...value.fields, [k]: { ...value.fields[k], ...patch } } });

  const setList = (k: keyof ApplyFormConfig, text: string) =>
    onChange({ ...value, [k]: linesToList(text) });

  return (
    <div className="space-y-6">
      <p className="text-[13px] leading-relaxed text-ink-500">
        공개 지원서(/recruit/apply)에 나오는 문항 문구·안내·선택지입니다. 안내 문구는 줄바꿈이 그대로 보입니다.
        <br />
        <strong className="text-ink-900">문항 제목을 비우면 그 항목은 지원서에서 빠집니다.</strong>{' '}
        (이름·전화번호는 결과 조회에 필요해 항상 받습니다.)
      </p>

      {/* 문항별 문구·안내·필수 여부 */}
      <div className="space-y-3">
        {FIELD_KEYS.map((k) => {
          const locked = ALWAYS_ON.includes(k);
          const off = value.fields[k].label.trim() === '';
          return (
            <div
              key={k}
              className={`rounded-xl border p-3.5 ${off ? 'border-ink-100 bg-cream-25' : 'border-ink-200 bg-white'}`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-400">
                  {FIELD_TITLES[k]}
                  {off && <span className="ml-2 normal-case text-coral-600">지원서에서 빠짐</span>}
                </span>
                <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-ink-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={value.fields[k].required}
                    disabled={locked}
                    onChange={(e) => setField(k, { required: e.target.checked })}
                  />
                  필수
                </label>
              </div>

              <div className="space-y-2">
                <Input
                  uiSize="sm"
                  type="text"
                  placeholder="문항 제목 (비우면 항목 제외)"
                  value={value.fields[k].label}
                  onChange={(e) => setField(k, { label: e.target.value })}
                  disabled={locked && false}
                />
                <textarea
                  className={`${taCls} h-16`}
                  placeholder="안내 문구 (선택, 줄바꿈 가능)"
                  value={value.fields[k].description}
                  onChange={(e) => setField(k, { description: e.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 지망 팀 — 선택지에는 팀 이름만, 지역·집결지 안내는 팀 설명이 맡는다.
          선택한 값이 그대로 지원자 행에 저장돼 심사·집계 화면의 팀 배지가 되기 때문이다. */}
      <div className="space-y-4 border-t border-ink-100 pt-5">
        <h3 className="text-sm font-bold text-ink-900">지망 팀</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="희망 팀 선택지 (줄바꿈으로 구분)"
            hint="1팀, 2팀처럼 팀 이름만 적습니다. 여기 적은 문구가 심사 화면의 팀 이름이 됩니다."
          >
            <textarea
              className={`${taCls} h-28`}
              placeholder={'1팀\n2팀\n3팀'}
              value={listToLines(value.wishTeamOptions)}
              onChange={(e) => setList('wishTeamOptions', e.target.value)}
            />
          </Field>
          <Field
            label="팀 설명"
            hint="봉사 지역·집결지를 적으면 지원서의 희망 팀 문항 위에 그대로 보입니다. 비워 두면 나오지 않습니다."
          >
            <textarea
              className={`${taCls} h-28`}
              placeholder={'1팀 — 강남 (집결지: 강남역)\n2팀 — 성북 (집결지: 성신여대입구역)'}
              value={value.teamDescription}
              onChange={(e) => onChange({ ...value, teamDescription: e.target.value })}
            />
          </Field>
        </div>
      </div>

      {/* 선택지 목록 */}
      <div className="space-y-4 border-t border-ink-100 pt-5">
        <h3 className="text-sm font-bold text-ink-900">그 밖의 선택지 목록 (줄바꿈으로 구분)</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {OPTION_LISTS.map(({ key, title, hint }) => (
            <Field key={String(key)} label={title} hint={hint || undefined}>
              <textarea
                className={`${taCls} h-28`}
                value={listToLines(value[key] as string[])}
                onChange={(e) => setList(key, e.target.value)}
              />
            </Field>
          ))}
        </div>

        <Field
          label="비대면 면접 체크박스 문구"
          hint="지원자가 체크했을 때 저장되는 값입니다. 체크하지 않으면 대면으로 처리됩니다."
        >
          <Input
            type="text"
            value={value.remoteInterviewCheckboxLabel}
            onChange={(e) => onChange({ ...value, remoteInterviewCheckboxLabel: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
