'use client';

import React, { useState } from 'react';
import { Button, Field, Input } from '@/components/ui';

export default function PublicRecruitLookupPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

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
        setErrorMsg(`⚠️ 너무 많은 조회가 시도되었습니다. ${data.retryAfter || 60}초 후 다시 시도해 주세요.`);
      } else {
        setErrorMsg('입력하신 정보와 일치하는 지원 내역이 없습니다.');
      }
    } catch {
      setErrorMsg('네트워크 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'doc_pass':
        return { label: '서류 합격', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'doc_fail':
        return { label: '서류 심사 완료', color: 'bg-cream-100 text-ink-700 border-cream-200' };
      case 'interview_done':
        return { label: '면접 완료', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'final_pass':
        return { label: '🎉 최종 합격', color: 'bg-success-100 text-success-700 border-success-200' };
      case 'final_fail':
        return { label: '모집 종료', color: 'bg-cream-100 text-ink-700 border-cream-200' };
      default:
        return { label: '서류 심사 진행 중', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-white to-cream-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-md w-full rounded-3xl border border-cream-200 bg-white/95 backdrop-blur-md p-8 shadow-modal space-y-6">
        {/* 헤더 브랜딩 */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-400 text-white shadow-card">
            <span className="text-2xl font-bold">🐾</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900">신입 모집 결과 조회</h1>
            <p className="mt-1 text-xs text-ink-500">
              지원 시 제출하신 성명과 연락처를 입력해 주세요.
            </p>
          </div>
        </div>

        {/* 조회 폼 */}
        <form onSubmit={handleLookup} className="space-y-4">
          <Field label="성명">
            <Input
              type="text"
              required
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="전화번호" hint="숫자만 또는 하이픈 포함 입력 가능">
            <Input
              type="text"
              required
              placeholder="01012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-control text-sm font-bold shadow-card hover:shadow-raised transition-all"
          >
            {loading ? '조회 확인 중…' : '결과 조회하기'}
          </Button>
        </form>

        {errorMsg && (
          <div className="rounded-xl border border-coral-200 bg-coral-50 p-3.5 text-xs font-semibold text-coral-700 text-center leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* 결과 카드 */}
        {result && (
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/60 to-cream-50 p-5 space-y-4 shadow-sm text-xs">
            <div className="text-center space-y-1.5 border-b border-blue-100 pb-3.5">
              <span className="text-ink-500 text-[11px] font-semibold uppercase tracking-wider">지원 상태</span>
              <div>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border ${getStatusDisplay(result.status).color}`}>
                  {getStatusDisplay(result.status).label}
                </span>
              </div>
            </div>

            {/* 면접 일정 안내 */}
            {result.schedulePublic && result.interviewSlot && (
              <div className="rounded-xl border border-blue-200 bg-white p-4 space-y-2 shadow-card">
                <div className="font-bold text-ink-900 text-sm flex items-center gap-1.5">
                  <span>📅</span> 면접 일정 안내
                </div>
                <div className="text-ink-700 font-medium leading-relaxed">
                  일시: {new Date(result.interviewSlot.startsAt).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  ({result.interviewSlot.durationMin}분 소요)
                </div>
                {result.interviewLink && (
                  <div className="pt-1.5">
                    <a
                      href={result.interviewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700 underline"
                    >
                      🔗 온라인 화상 면접 접속 링크 열기
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* 최종 모집 결과 안내 */}
            {result.resultPublic && (
              <div className="rounded-xl border border-cream-200 bg-white p-4 text-center space-y-2 shadow-card">
                <div className="font-bold text-ink-900 text-sm">🏆 최종 모집 결과</div>
                <div className={`text-sm font-bold leading-relaxed ${result.status === 'final_pass' ? 'text-success-700' : 'text-ink-700'}`}>
                  {result.status === 'final_pass'
                    ? '🎉 축하합니다! 애니멀메이트 신입 부원으로 최종 합격하셨습니다.'
                    : '아쉽게도 제한된 정원으로 인해 이번 기수에는 함께하지 못하게 되었습니다. 지원해 주셔서 진심으로 감사드립니다.'}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 text-[11px] text-ink-400 text-center leading-relaxed font-medium">
          🔒 입력하신 개인정보는 모집 및 선발 목적으로만 이용되며, 모집 절차 완료 후 즉시 안전하게 영구 파기됩니다.
        </div>
      </div>
    </div>
  );
}
