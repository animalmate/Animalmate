'use client';

import React, { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Icon } from '@/components/icon';
import { CursorDog } from '@/components/cursor-dog';
import type { ApplyFormConfig } from '@/recruit/apply-form';

interface CohortSummary {
  id: string;
  label: string;
  isClosed: boolean;
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  // 성별·지망 팀은 기본값을 비워 둔다 — 미리 골라 두면 지원자가 확인 없이 그대로 제출한다.
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
  remoteInterviewWish: '',
  essayIntro: '',
  essayValues: '',
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
    <main className="flex min-h-screen items-center justify-center bg-cream-25 p-4 font-sans">
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
  teams,
  form: config,
}: {
  cohort: CohortSummary | null;
  // 실제 teams 테이블에서 온 목록(서버가 넘겨준다) — 코드에 박아 두지 않는다.
  teams: string[];
  // 선택지·문항도 기수 설정에서 온다(회장단이 "0. 공고·마감 설정"에서 편집).
  form: ApplyFormConfig;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ name: string; phone: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setErrorMsg('이름과 전화번호는 필수 입력 항목입니다.');
      return;
    }
    if (form.wishTeam1 && form.wishTeam1 === form.wishTeam2) {
      setErrorMsg('1지망과 2지망은 서로 다른 팀으로 선택해 주세요.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/recruit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId: cohort?.id, ...form }),
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="애니멀메이트" className="h-12 w-12 rounded-full" />
            <span className="inline-flex items-center rounded-lg bg-coral-50 px-3 py-1 text-xs font-bold text-coral-700">
              {cohort.label} 지원서
            </span>
            <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">애니멀메이트 신입 부원 지원</h1>
            <p className="text-[13px] leading-relaxed text-ink-500">
              제출하신 정보는 선발 목적으로만 이용하며, 모집 절차가 끝나는 즉시 모두 폐기합니다.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-7" noValidate>
            <section className="space-y-4">
              <SectionHeading step={1}>기본 인적사항</SectionHeading>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="이름" required>
                  <Input
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="홍길동"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </Field>

                <Field label="전화번호" required hint="하이픈은 있어도 없어도 됩니다.">
                  <Input
                    type="tel"
                    required
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="01012345678"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="성별">
                  <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                    <option value="">선택 안 함</option>
                    {config.genderOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="생년월일">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="2004-03-15"
                    value={form.birthDate}
                    onChange={(e) => set('birthDate', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="학교">
                  <Input
                    type="text"
                    autoComplete="organization"
                    placeholder="OO대학교"
                    value={form.school}
                    onChange={(e) => set('school', e.target.value)}
                  />
                </Field>

                <Field label="학과 / 전공">
                  <Input
                    type="text"
                    placeholder="수의학과"
                    value={form.department}
                    onChange={(e) => set('department', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="이메일">
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="example@email.com"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </Field>

                {/* 주소 전체가 아니라 역명만 받는다(09-RECRUIT-DESIGN §0 개인정보 최소화). */}
                <Field label="가장 가까운 지하철역" hint="집 주소는 받지 않습니다.">
                  <Input
                    type="text"
                    placeholder="건대입구역"
                    value={form.nearStation}
                    onChange={(e) => set('nearStation', e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading step={2}>지망 팀과 일정</SectionHeading>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="1지망 팀">
                  <Select value={form.wishTeam1} onChange={(e) => set('wishTeam1', e.target.value)}>
                    <option value="">선택해 주세요</option>
                    {teams.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="2지망 팀">
                  <Select value={form.wishTeam2} onChange={(e) => set('wishTeam2', e.target.value)}>
                    <option value="">선택해 주세요</option>
                    {teams.filter((t) => t !== form.wishTeam1).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="신입 OT 참석 여부">
                  <Select value={form.otAttend} onChange={(e) => set('otAttend', e.target.value)}>
                    <option value="">선택해 주세요</option>
                    {config.otAttendOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="면접 희망 방식">
                  <Select
                    value={form.remoteInterviewWish}
                    onChange={(e) => set('remoteInterviewWish', e.target.value)}
                  >
                    <option value="">선택해 주세요</option>
                    {config.remoteInterviewOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/* 아래 3개는 DB 에는 원래 있던 항목인데 화면에서 빠져 있었다(지원 경로·대외활동·참여 주기).
                  심사에 쓰이는 정보라 되살린다. 지원 경로 선택지도 기수 설정에서 온다. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="지원 경로" hint="어떻게 알고 오셨나요?">
                  <Select value={form.applyRoute} onChange={(e) => set('applyRoute', e.target.value)}>
                    <option value="">선택해 주세요</option>
                    {config.applyRouteOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="예상 활동 참여 주기">
                  <Input
                    type="text"
                    placeholder="매주 / 격주 / 월 1회"
                    value={form.expectedFrequency}
                    onChange={(e) => set('expectedFrequency', e.target.value)}
                  />
                </Field>
              </div>

              <Field label="다른 대외활동·아르바이트" hint="없으면 비워 두셔도 됩니다.">
                <Input
                  type="text"
                  placeholder="예: 교내 학회, 주말 아르바이트"
                  value={form.otherActivities}
                  onChange={(e) => set('otherActivities', e.target.value)}
                />
              </Field>
            </section>

            {/* 문항 문구는 기수 설정에서 온다. 문구를 비워 두면 그 문항은 아예 받지 않는다. */}
            {(config.essayIntroLabel || config.essayValuesLabel) && (
              <section className="space-y-4">
                <SectionHeading step={3}>자기소개서</SectionHeading>

                {config.essayIntroLabel && (
                  <Field label={config.essayIntroLabel}>
                    <Textarea
                      rows={6}
                      placeholder="자유롭게 작성해 주세요."
                      value={form.essayIntro}
                      onChange={(e) => set('essayIntro', e.target.value)}
                    />
                  </Field>
                )}

                {config.essayValuesLabel && (
                  <Field label={config.essayValuesLabel}>
                    <Textarea
                      rows={6}
                      placeholder="자유롭게 작성해 주세요."
                      value={form.essayValues}
                      onChange={(e) => set('essayValues', e.target.value)}
                    />
                  </Field>
                )}
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

            <div className="border-t border-ink-100 pt-5">
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? '제출 중…' : '지원서 제출하기'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
