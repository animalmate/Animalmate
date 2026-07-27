'use client';

import React, { useId, useState } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { Icon } from '@/components/icon';
import { CursorDog } from '@/components/cursor-dog';
import type { PublicStage } from '@/recruit/lookup-visibility';

interface LookupResult {
  stage: PublicStage;
  schedulePublic: boolean;
  resultPublic: boolean;
  assignedTeam?: string | null;
  congratsMessage?: string | null;
  postPassNotice?: string | null;
  interviewSlot?: {
    startsAt: string;
    durationMin: number;
    link?: string | null;
    venue?: string | null;
  } | null;
  interviewLink?: string | null;
}

// 진행 막대의 4단계. 서버가 준 stage 를 이 축 위의 위치로만 바꾼다
// (당락 판단은 서버에서 끝났고 여기서는 표시만 한다 — 규칙 #6).
const STEPS = ['접수', '서류', '면접', '결과'] as const;

const STAGE_META: Record<
  PublicStage,
  { step: number; label: string; tone: 'neutral' | 'progress' | 'pass' | 'closed'; detail: string }
> = {
  received: {
    step: 0,
    label: '접수 완료',
    tone: 'neutral',
    detail: '지원서가 정상적으로 접수되었습니다. 심사 결과는 준비되는 대로 이 화면에 표시됩니다.',
  },
  under_review: {
    step: 1,
    label: '심사 중',
    tone: 'progress',
    detail: '현재 심사가 진행 중입니다. 결과가 공개되면 이 화면에서 확인하실 수 있습니다.',
  },
  doc_pass: {
    step: 2,
    label: '서류 합격',
    tone: 'pass',
    detail: '서류 심사에 합격하셨습니다. 아래 면접 안내를 확인해 주세요.',
  },
  doc_fail: {
    step: 1,
    label: '서류 심사 완료',
    tone: 'closed',
    detail: '아쉽게도 이번 서류 심사에서는 함께하지 못하게 되었습니다. 지원해 주셔서 감사합니다.',
  },
  interview_done: {
    step: 3,
    label: '면접 완료',
    tone: 'progress',
    detail: '면접이 완료되었습니다. 최종 결과가 공개되면 이 화면에 표시됩니다.',
  },
  interview_noshow: {
    step: 3,
    label: '면접 미참석',
    tone: 'closed',
    detail: '면접 참석 기록이 확인되지 않았습니다. 착오가 있다면 운영진에게 문의해 주세요.',
  },
  final_pass: {
    step: 4,
    label: '최종 합격',
    tone: 'pass',
    detail: '',
  },
  final_fail: {
    step: 4,
    label: '모집 절차 종료',
    tone: 'closed',
    detail: '아쉽게도 이번 기수에는 함께하지 못하게 되었습니다. 지원해 주셔서 진심으로 감사드립니다.',
  },
};

const TONE_BADGE: Record<string, string> = {
  neutral: 'bg-cream-100 text-ink-700 border-ink-200',
  progress: 'bg-blue-50 text-blue-700 border-blue-200',
  pass: 'bg-success-100 text-success-700 border-success',
  closed: 'bg-cream-100 text-ink-700 border-ink-200',
};

function ProgressBar({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1" aria-label="지원 진행 단계">
      {STEPS.map((label, i) => {
        const reached = i < current;
        const active = i === current - 1;
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={`h-1.5 w-full rounded-full transition-colors ${
                reached ? 'bg-blue-500' : 'bg-cream-200'
              }`}
            />
            <span
              className={`text-[11px] font-semibold ${active ? 'text-blue-700' : reached ? 'text-ink-700' : 'text-ink-400'}`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function PublicRecruitLookupPanel() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const resultRegionId = useId();

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    setLoading(true);
    setErrorMsg('');
    setResult(null);

    try {
      const res = await fetch('/api/recruit/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.result) {
        setResult(data.result);
      } else if (res.status === 429) {
        setErrorMsg(`조회 시도가 너무 잦습니다. ${data.retryAfter || 60}초 후 다시 시도해 주세요.`);
      } else {
        // 실패 메시지는 단일화한다(09-RECRUIT-DESIGN §6.7) — 어떤 이름이 존재하는지 알려주지 않는다.
        setErrorMsg('입력 정보를 확인해주세요.');
      }
    } catch {
      setErrorMsg('네트워크 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const meta = result ? STAGE_META[result.stage] : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 font-sans sm:p-6">
      <CursorDog />
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-5 rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-7">
          <header className="space-y-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="애니멀메이트" className="mx-auto h-14 w-14 rounded-full" />
            <h1 className="text-lg font-bold text-ink-900">신입 모집 결과 조회</h1>
            <p className="text-[13px] leading-relaxed text-ink-500">
              지원 시 제출하신 이름과 전화번호를 입력해 주세요.
            </p>
          </header>

          <form onSubmit={handleLookup} className="space-y-4" noValidate>
            <Field label="이름" required>
              <Input
                type="text"
                required
                autoComplete="name"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="전화번호" required hint="하이픈은 있어도 없어도 됩니다.">
              <Input
                type="tel"
                required
                inputMode="numeric"
                autoComplete="tel"
                placeholder="01012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? '조회 중…' : '결과 조회하기'}
            </Button>
          </form>

          {/* 결과·오류는 같은 live 영역에 넣어 스크린리더가 변화를 읽게 한다. */}
          <div id={resultRegionId} aria-live="polite" className="space-y-4 empty:hidden">
            {errorMsg && (
              <p
                role="alert"
                className="rounded-xl border border-coral-100 bg-coral-50 p-3.5 text-center text-[13px] font-semibold leading-relaxed text-coral-700"
              >
                {errorMsg}
              </p>
            )}

            {result && meta && (
              <section className="space-y-4 rounded-2xl border border-ink-200 bg-cream-25 p-5">
                <div className="space-y-3 border-b border-ink-100 pb-4 text-center">
                  <span
                    className={`inline-flex items-center rounded-lg border px-3 py-1 text-[13px] font-bold ${TONE_BADGE[meta.tone]}`}
                  >
                    {meta.label}
                  </span>
                  <ProgressBar current={meta.step} />
                </div>

                {/* 최종 합격일 때만 축하 문구가 서버에서 내려온다. */}
                {result.stage === 'final_pass' ? (
                  <p className="text-center text-[15px] font-bold leading-relaxed text-success-700">
                    {result.congratsMessage ||
                      '축하합니다! 애니멀메이트 신입 부원으로 최종 합격하셨습니다.'}
                  </p>
                ) : (
                  <p className="text-center text-[13px] leading-relaxed text-ink-700">{meta.detail}</p>
                )}

                {result.interviewSlot && (
                  <div className="space-y-2 rounded-xl border border-blue-200 bg-white p-4">
                    <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                      <Icon name="calendar" size={16} className="text-blue-600" />
                      면접 안내
                    </h2>
                    <dl className="space-y-1 text-[13px] text-ink-700">
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-semibold text-ink-500">일시</dt>
                        <dd className="font-medium">
                          {new Date(result.interviewSlot.startsAt).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          ({result.interviewSlot.durationMin}분)
                        </dd>
                      </div>
                      {result.interviewSlot.venue && (
                        <div className="flex gap-2">
                          <dt className="shrink-0 font-semibold text-ink-500">장소</dt>
                          <dd className="font-medium">{result.interviewSlot.venue}</dd>
                        </div>
                      )}
                    </dl>
                    {result.interviewLink && (
                      <a
                        href={result.interviewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-tap items-center gap-1.5 text-[13px] font-bold text-blue-600 underline transition-colors hover:text-blue-700"
                      >
                        <Icon name="external" size={16} />
                        화상 면접 링크 열기
                      </a>
                    )}
                  </div>
                )}

                {result.stage === 'final_pass' && (result.assignedTeam || result.postPassNotice) && (
                  <div className="space-y-2 rounded-xl border border-ink-200 bg-white p-4">
                    {result.assignedTeam && (
                      <p className="text-[13px] font-semibold text-ink-900">
                        배정 팀 <span className="ml-1 font-bold text-blue-700">{result.assignedTeam}</span>
                      </p>
                    )}
                    {result.postPassNotice && (
                      <div className="space-y-1 border-t border-ink-100 pt-2">
                        <h2 className="text-[13px] font-bold text-ink-900">합격 후 안내</h2>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-700">
                          {result.postPassNotice}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        <p className="px-2 text-center text-[11px] font-medium leading-relaxed text-ink-400">
          입력하신 지원 정보는 선발 목적으로만 이용하며, 모집 절차가 끝나는 즉시 모두 폐기합니다.
        </p>
      </div>
    </main>
  );
}
