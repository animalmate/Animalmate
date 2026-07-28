'use client';

import React, { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Icon } from '@/components/icon';
import { CursorDog } from '@/components/cursor-dog';
import type { ApplyFormConfig, FieldKey } from '@/recruit/apply-form';
import { CONSENT_LABEL } from '@/legal/privacy';

interface CohortSummary {
  id: string;
  label: string;
  isClosed: boolean;
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  // 성별·지망 팀 등은 기본 선택을 두지 않는다 — 미리 골라 두면 확인 없이 그대로 제출된다.
  gender: '',
  birthDate: '',
  school: '',
  department: '',
  email: '',
  applyRoute: '',
  otherActivities: '',
  expectedFrequency: '',
  nearStation: '',
  wishTeam1: '',
  wishTeam2: '',
  otAttend: '',
  essayIntro: '',
  essayValues: '',
  essayValuesTopic: '',
  englishName: '',
};

function SectionHeading({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">
        {step}
      </span>
      {children}
    </h2>
  );
}

/** 안내만 하는 전체화면 카드(마감·접수완료). */
function NoticeCard({
  tone,
  icon,
  title,
  children,
  actions,
}: {
  tone: 'amber' | 'success';
  icon: 'info' | 'check';
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  const toneClass = tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-success-100 text-success-700';
  return (
    <main className="flex min-h-screen items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-ink-200 bg-white p-7 text-center shadow-card">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${toneClass}`}>
          <Icon name={icon} size={24} />
        </div>
        <h1 className="text-lg font-bold text-ink-900">{title}</h1>
        <div className="text-[13px] leading-relaxed text-ink-500">{children}</div>
        <div className="space-y-2 pt-1">{actions}</div>
      </div>
    </main>
  );
}

const linkPrimary =
  'flex min-h-tap w-full items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-blue-600';
const linkQuiet =
  'flex min-h-tap w-full items-center justify-center rounded-xl bg-cream-100 px-4 text-sm font-semibold text-ink-700 no-underline transition-colors hover:bg-cream-200';

export function PublicRecruitApplyPanel({
  cohort,
  form: config,
}: {
  cohort: CohortSummary | null;
  // 문항 문구·안내·선택지 모두 기수 설정에서 온다(회장단이 "0. 공고·마감 설정"에서 편집).
  form: ApplyFormConfig;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  // 비대면 면접은 라디오가 아니라 체크박스다 — 체크하면 비대면 희망, 안 하면 대면.
  const [remoteWish, setRemoteWish] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ name: string; phone: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // 개인정보 수집·이용 동의. 지원자는 비부원이라 동의 없이 받아 두면 안 된다.
  // 서버(/api/recruit/apply)도 같은 값을 다시 검사한다(규칙 #6).
  const [consent, setConsent] = useState(false);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** 문항이 켜져 있는가(문구를 비우면 그 문항을 받지 않는다). */
  const on = (k: FieldKey) => config.fields[k].label.trim() !== '';
  /** Field 에 넘길 공통 속성. */
  const fp = (k: FieldKey) => ({
    label: config.fields[k].label,
    hint: config.fields[k].description || undefined,
    required: config.fields[k].required,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 필수 검사는 설정을 따른다. 이름·전화번호는 조회 키라 항상 필요하다.
    const missing: string[] = [];
    if (!form.name.trim()) missing.push(config.fields.name.label || '이름');
    if (!form.phone.trim()) missing.push(config.fields.phone.label || '전화번호');
    for (const k of ['gender', 'birthDate', 'school', 'department', 'email', 'applyRoute',
      'essayIntro', 'essayValues', 'otherActivities', 'expectedFrequency',
      'wishTeam1', 'wishTeam2', 'nearStation', 'otAttend', 'englishName'] as FieldKey[]) {
      if (!on(k) || !config.fields[k].required) continue;
      const v = k === 'essayValues' ? form.essayValues : (form as Record<string, string>)[k];
      if (!String(v ?? '').trim()) missing.push(config.fields[k].label);
    }
    if (missing.length > 0) {
      setErrorMsg(`다음 항목을 입력해 주세요: ${missing.join(', ')}`);
      return;
    }
    if (form.wishTeam1 && form.wishTeam1 === form.wishTeam2) {
      setErrorMsg('1순위와 2순위는 서로 다른 팀으로 선택해 주세요.');
      return;
    }
    if (!consent) {
      setErrorMsg('개인정보 수집·이용에 동의해야 지원서를 제출할 수 있습니다.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/recruit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: cohort?.id,
          ...form,
          privacyConsent: consent,
          // 체크했을 때만 설정된 문구를 저장한다. 안 하면 빈 값 = 대면.
          remoteInterviewWish: remoteWish ? config.remoteInterviewCheckboxLabel : '',
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setSubmitted({ name: form.name, phone: form.phone });
      } else if (res.status === 429) {
        setErrorMsg(`제출 시도가 너무 잦습니다. ${data.retryAfter || 60}초 후 다시 시도해 주세요.`);
      } else {
        setErrorMsg(data.message || '제출에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } catch {
      setErrorMsg('네트워크 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!cohort) {
    return (
      <NoticeCard
        tone="amber"
        icon="info"
        title="진행 중인 모집이 없습니다"
        actions={
          <a href="/recruit/notice" className={linkPrimary}>
            모집 공고 보기
          </a>
        }
      >
        새 모집이 시작되면 공고 페이지에서 안내드립니다.
      </NoticeCard>
    );
  }

  if (cohort.isClosed) {
    return (
      <NoticeCard
        tone="amber"
        icon="info"
        title="신입 모집이 마감되었습니다"
        actions={
          <a href="/recruit" className={linkPrimary}>
            내 지원 결과 조회
          </a>
        }
      >
        성원에 감사드립니다. {cohort.label} 신입 부원 접수가 종료되었습니다.
      </NoticeCard>
    );
  }

  if (submitted) {
    return (
      <NoticeCard
        tone="success"
        icon="check"
        title="지원서가 접수되었습니다"
        actions={
          <>
            <a href="/recruit" className={linkPrimary}>
              내 지원 결과 조회
            </a>
            <a href="/recruit/notice" className={linkQuiet}>
              모집 공고로 돌아가기
            </a>
          </>
        }
      >
        <p>심사 결과는 조회 페이지에서 이름과 전화번호로 확인하실 수 있습니다.</p>
        <dl className="mt-3 space-y-1 rounded-xl border border-ink-100 bg-cream-25 p-3 text-left text-[13px] text-ink-700">
          <div className="flex gap-2">
            <dt className="font-semibold text-ink-500">이름</dt>
            <dd className="font-medium">{submitted.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-ink-500">연락처</dt>
            <dd className="font-medium">{submitted.phone}</dd>
          </div>
        </dl>
      </NoticeCard>
    );
  }

  return (
    <main className="min-h-screen p-4 font-sans sm:p-8">
      <CursorDog />
      <div className="mx-auto max-w-2xl">
        <div className="space-y-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">
          <header className="space-y-2 border-b border-ink-100 pb-5">
            <img src="/logo.png" alt="애니멀메이트" className="h-12 w-12 rounded-full" />
            <span className="inline-flex items-center rounded-lg bg-coral-50 px-3 py-1 text-xs font-bold text-coral-700">
              {cohort.label} 지원서
            </span>
            <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">애니멀메이트 신입 부원 지원</h1>
            <p className="text-[13px] leading-relaxed text-ink-500">
              제출하신 정보는 선발 목적으로만 이용하며, 모집 절차가 끝나는 즉시 모두 폐기합니다.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-8" noValidate>
            <section className="space-y-4">
              <SectionHeading step={1}>기본 인적사항</SectionHeading>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field {...fp('name')} required>
                  <Input
                    type="text"
                    autoComplete="name"
                    placeholder="홍길동"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </Field>

                <Field {...fp('phone')} required>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="01012345678"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </Field>

                {on('gender') && (
                  <Field {...fp('gender')}>
                    <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                      <option value="">선택해 주세요</option>
                      {config.genderOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                {on('birthDate') && (
                  <Field {...fp('birthDate')}>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="2004.03.15"
                      value={form.birthDate}
                      onChange={(e) => set('birthDate', e.target.value)}
                    />
                  </Field>
                )}

                {on('school') && (
                  <Field {...fp('school')}>
                    <Input
                      type="text"
                      autoComplete="organization"
                      placeholder="OO대학교"
                      value={form.school}
                      onChange={(e) => set('school', e.target.value)}
                    />
                  </Field>
                )}

                {on('department') && (
                  <Field {...fp('department')}>
                    <Input
                      type="text"
                      placeholder="수의예과"
                      value={form.department}
                      onChange={(e) => set('department', e.target.value)}
                    />
                  </Field>
                )}
              </div>

              {on('email') && (
                <Field {...fp('email')}>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="example@naver.com"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </Field>
              )}

              {on('nearStation') && (
                <Field {...fp('nearStation')}>
                  <Input
                    type="text"
                    placeholder="건대입구역"
                    value={form.nearStation}
                    onChange={(e) => set('nearStation', e.target.value)}
                  />
                </Field>
              )}

              {on('applyRoute') && (
                <Field {...fp('applyRoute')}>
                  <Select value={form.applyRoute} onChange={(e) => set('applyRoute', e.target.value)}>
                    <option value="">선택해 주세요</option>
                    {config.applyRouteOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </section>

            <section className="space-y-4">
              <SectionHeading step={2}>활동 계획</SectionHeading>

              {on('wishTeam1') && (
                <Field {...fp('wishTeam1')}>
                  <Select value={form.wishTeam1} onChange={(e) => set('wishTeam1', e.target.value)}>
                    <option value="">선택해 주세요</option>
                    {config.wishTeamOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {on('wishTeam2') && (
                <Field {...fp('wishTeam2')}>
                  <Select value={form.wishTeam2} onChange={(e) => set('wishTeam2', e.target.value)}>
                    <option value="">선택해 주세요</option>
                    {config.wishTeamOptions
                      .filter((t) => t !== form.wishTeam1)
                      .map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    {config.wishTeam2ExtraOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {on('expectedFrequency') && (
                <Field {...fp('expectedFrequency')}>
                  <Select
                    value={form.expectedFrequency}
                    onChange={(e) => set('expectedFrequency', e.target.value)}
                  >
                    <option value="">선택해 주세요</option>
                    {config.expectedFrequencyOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {on('otherActivities') && (
                <Field {...fp('otherActivities')}>
                  <Textarea
                    rows={4}
                    placeholder="없으면 '없음'이라고 적어 주세요."
                    value={form.otherActivities}
                    onChange={(e) => set('otherActivities', e.target.value)}
                  />
                </Field>
              )}

              {on('otAttend') && (
                <Field {...fp('otAttend')}>
                  <Select value={form.otAttend} onChange={(e) => set('otAttend', e.target.value)}>
                    <option value="">선택해 주세요</option>
                    {config.otAttendOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {/* 비대면 면접만 체크박스다 — 라디오로 두면 "대면"을 굳이 고르게 만든다. */}
              {on('remoteInterview') && (
                <div className="space-y-1.5 rounded-xl border-[1.5px] border-ink-200 bg-cream-25 p-4">
                  <span className="block whitespace-pre-line text-sm font-semibold text-ink-900">
                    {config.fields.remoteInterview.label}
                  </span>
                  {config.fields.remoteInterview.description && (
                    <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-500">
                      {config.fields.remoteInterview.description}
                    </p>
                  )}
                  <label className="mt-1 flex min-h-tap cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={remoteWish}
                      onChange={(e) => setRemoteWish(e.target.checked)}
                      className="h-5 w-5 shrink-0 accent-primary"
                    />
                    <span className="text-sm font-semibold text-ink-900">
                      {config.remoteInterviewCheckboxLabel}
                    </span>
                  </label>
                  <p className="text-[12px] text-ink-400">체크하지 않으면 대면 면접으로 진행됩니다.</p>
                </div>
              )}
            </section>

            {(on('essayIntro') || on('essayValues')) && (
              <section className="space-y-4">
                <SectionHeading step={3}>자기소개서</SectionHeading>

                {on('essayIntro') && (
                  <Field {...fp('essayIntro')}>
                    <Textarea
                      rows={7}
                      placeholder="자유롭게 작성해 주세요."
                      value={form.essayIntro}
                      onChange={(e) => set('essayIntro', e.target.value)}
                    />
                  </Field>
                )}

                {on('essayValues') && (
                  <Field {...fp('essayValues')}>
                    <div className="space-y-2">
                      {config.essayValuesTopics.length > 0 && (
                        <Select
                          value={form.essayValuesTopic}
                          onChange={(e) => set('essayValuesTopic', e.target.value)}
                          aria-label="주제 선택"
                        >
                          <option value="">주제를 선택해 주세요</option>
                          {config.essayValuesTopics.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </Select>
                      )}
                      <Textarea
                        rows={7}
                        placeholder="선택한 주제에 대한 생각을 자유롭게 작성해 주세요."
                        value={form.essayValues}
                        onChange={(e) => set('essayValues', e.target.value)}
                      />
                    </div>
                  </Field>
                )}
              </section>
            )}

            {on('englishName') && (
              <section className="space-y-4">
                <SectionHeading step={4}>추가 정보</SectionHeading>
                <Field {...fp('englishName')}>
                  <Input
                    type="text"
                    placeholder="Hong Gildong"
                    value={form.englishName}
                    onChange={(e) => set('englishName', e.target.value)}
                  />
                </Field>
              </section>
            )}

            <div aria-live="polite">
              {errorMsg && (
                <p
                  role="alert"
                  className="rounded-xl border border-coral-100 bg-coral-50 p-3.5 text-center text-[13px] font-semibold text-coral-700"
                >
                  {errorMsg}
                </p>
              )}
            </div>

            <div className="space-y-4 border-t border-ink-100 pt-5">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-cream-50 p-3.5">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-coral-600"
                />
                <span className="text-[12.5px] leading-relaxed text-ink-600">
                  {CONSENT_LABEL.apply}{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                    개인정보처리방침
                  </a>
                </span>
              </label>
              <Button type="submit" disabled={submitting || !consent} className="w-full">
                {submitting ? '제출 중…' : '지원서 제출하기'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
