'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export default function PublicRecruitApplyPage() {
  const [cohort, setCohort] = useState<any>(null);
  const [loadingNotice, setLoadingNotice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // 폼 입력 상태
  const [form, setForm] = useState({
    name: '',
    phone: '',
    gender: '남성',
    birthDate: '',
    school: '',
    department: '',
    email: '',
    applyRoute: '에브리타임',
    wishTeam1: '봉사 1팀',
    wishTeam2: '봉사 2팀',
    nearStation: '',
    otAttend: '참석 가능',
    remoteInterviewWish: '대면 면접 희망',
    essayIntro: '',
    essayValues: '',
  });

  useEffect(() => {
    fetchNotice();
  }, []);

  const fetchNotice = async () => {
    try {
      const res = await fetch('/api/recruit/notice');
      const data = await res.json();
      if (data.cohort) {
        setCohort(data.cohort);
      }
    } finally {
      setLoadingNotice(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setErrorMsg('성명과 전화번호는 필수 입력 항목입니다.');
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
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setSubmittedId(data.applicantId);
      } else if (res.status === 429) {
        setErrorMsg(`⚠️ 너무 많은 제출 시도가 이뤄졌습니다. ${data.retryAfter || 60}초 후 다시 시도해주세요.`);
      } else {
        setErrorMsg(`제출 실패: ${data.message || data.error}`);
      }
    } catch {
      setErrorMsg('네트워크 통신 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingNotice) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
        <p className="text-sm font-semibold text-ink-500">양식을 준비하는 중입니다…</p>
      </div>
    );
  }

  if (cohort?.isClosed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream-50 via-white to-cream-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4 shadow-modal rounded-3xl border-amber-200">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 text-3xl font-bold">
            🔒
          </div>
          <h1 className="text-xl font-bold text-ink-900">신입 모집이 마감되었습니다</h1>
          <p className="text-xs text-ink-500 leading-relaxed">
            성원에 감사드립니다. {cohort.label} 신입 부원 접수가 종료되어 더 이상 지원서를 제출할 수 없습니다.
          </p>
          <div className="pt-2">
            <a href="/recruit" className="inline-block w-full py-3 bg-blue-600 text-white font-bold text-sm rounded-xl no-underline">
              내 지원 결과 조회하기
            </a>
          </div>
        </Card>
      </div>
    );
  }

  if (submittedId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream-50 via-white to-cream-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-5 shadow-modal rounded-3xl border-blue-200">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success-100 text-success-700 text-3xl font-bold">
            🎉
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">지원서가 성공적으로 접수되었습니다!</h1>
            <p className="mt-1.5 text-xs text-ink-500 leading-relaxed">
              지원자님의 소중한 지원서가 운영진 서류 심사 시스템에 실시간으로 전달되었습니다.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-xs space-y-1 text-ink-700 font-medium">
            <p><strong>성명:</strong> {form.name}</p>
            <p><strong>연락처:</strong> {form.phone}</p>
            <p><strong>1지망 팀:</strong> {form.wishTeam1}</p>
          </div>

          <div className="pt-2 space-y-2">
            <a href="/recruit" className="block w-full py-3 bg-blue-600 text-white font-bold text-sm rounded-xl no-underline shadow-card">
              나중에 내 지원 결과 조회하기 🔍
            </a>
            <a href="/recruit/notice" className="block w-full py-2.5 bg-cream-100 text-ink-700 font-semibold text-xs rounded-xl no-underline">
              모집 공고로 돌아가기
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-white to-cream-100 p-4 sm:p-8 font-sans">
      <head>
        <title>{cohort ? `${cohort.label} 신입 부원 지원서 작성` : '신입 부원 지원서 작성'}</title>
      </head>

      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="p-6 sm:p-8 space-y-6 bg-white/95 backdrop-blur-md shadow-modal rounded-3xl border-cream-200">
          <div className="border-b border-cream-200 pb-4">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
              {cohort?.label || '신입'} 지원서
            </span>
            <h1 className="text-2xl font-bold text-ink-900 mt-2">애니멀메이트 신입 부원 지원하기</h1>
            <p className="mt-1 text-xs text-ink-500">
              제출하신 정보는 동아리 신입 부원 선발 목적으로만 사용되며 안전하게 보호됩니다.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 기본 인적사항 */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-900 border-l-4 border-blue-600 pl-2.5">
                1. 기본 인적사항
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="성명 (필수)">
                  <Input
                    type="text"
                    required
                    placeholder="홍길동"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>

                <Field label="전화번호 (필수)" hint="숫자만 입력">
                  <Input
                    type="text"
                    required
                    placeholder="01012345678"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="성별">
                  <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    <option value="남성">남성</option>
                    <option value="여성">여성</option>
                    <option value="기타">기타</option>
                  </Select>
                </Field>

                <Field label="생년월일">
                  <Input
                    type="text"
                    placeholder="YYYY-MM-DD 또는 YYMMDD"
                    value={form.birthDate}
                    onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="학교">
                  <Input
                    type="text"
                    placeholder="예: OO대학교"
                    value={form.school}
                    onChange={(e) => setForm({ ...form, school: e.target.value })}
                  />
                </Field>

                <Field label="학과 / 전공">
                  <Input
                    type="text"
                    placeholder="예: 수의학과 / 경영학과"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="이메일">
                  <Input
                    type="email"
                    placeholder="example@email.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>

                <Field label="가장 가까운 지하철역">
                  <Input
                    type="text"
                    placeholder="예: 건대입구역, 신촌역"
                    value={form.nearStation}
                    onChange={(e) => setForm({ ...form, nearStation: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            {/* 희망 팀 및 지망 */}
            <div className="space-y-4 pt-2">
              <h3 className="text-sm font-bold text-ink-900 border-l-4 border-blue-600 pl-2.5">
                2. 지원 지망 팀 선택
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="1지망 지원 팀">
                  <Select value={form.wishTeam1} onChange={(e) => setForm({ ...form, wishTeam1: e.target.value })}>
                    <option value="봉사 1팀">봉사 1팀</option>
                    <option value="봉사 2팀">봉사 2팀</option>
                    <option value="기획팀">기획팀</option>
                    <option value="홍보팀">홍보팀</option>
                  </Select>
                </Field>

                <Field label="2지망 지원 팀">
                  <Select value={form.wishTeam2} onChange={(e) => setForm({ ...form, wishTeam2: e.target.value })}>
                    <option value="봉사 2팀">봉사 2팀</option>
                    <option value="봉사 1팀">봉사 1팀</option>
                    <option value="기획팀">기획팀</option>
                    <option value="홍보팀">홍보팀</option>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="신입 OT 참석 여부">
                  <Select value={form.otAttend} onChange={(e) => setForm({ ...form, otAttend: e.target.value })}>
                    <option value="참석 가능">참석 가능</option>
                    <option value="불참 (사유 기재 필요)">불참</option>
                  </Select>
                </Field>

                <Field label="면접 희망 방식">
                  <Select value={form.remoteInterviewWish} onChange={(e) => setForm({ ...form, remoteInterviewWish: e.target.value })}>
                    <option value="대면 면접 희망">대면 면접 희망</option>
                    <option value="비대면 면접 희망 (Zoom)">비대면 면접 희망 (Zoom)</option>
                  </Select>
                </Field>
              </div>
            </div>

            {/* 자기소개서 */}
            <div className="space-y-4 pt-2">
              <h3 className="text-sm font-bold text-ink-900 border-l-4 border-blue-600 pl-2.5">
                3. 자기소개서
              </h3>

              <Field label="자기소개 및 동물에 대한 생각" hint="자유롭게 작성해 주세요.">
                <textarea
                  className="w-full h-32 rounded-xl border border-ink-200 p-3 text-xs font-sans text-ink-900 outline-none focus:border-blue-500 leading-relaxed"
                  placeholder="자기소개를 기재해 주세요..."
                  value={form.essayIntro}
                  onChange={(e) => setForm({ ...form, essayIntro: e.target.value })}
                />
              </Field>

              <Field label="동아리 지원 동기 및 가치관" hint="애니멀메이트 지원 동기를 적어주세요.">
                <textarea
                  className="w-full h-32 rounded-xl border border-ink-200 p-3 text-xs font-sans text-ink-900 outline-none focus:border-blue-500 leading-relaxed"
                  placeholder="동아리 활동을 통해 이루고 싶은 점이나 가치관을 기재해 주세요..."
                  value={form.essayValues}
                  onChange={(e) => setForm({ ...form, essayValues: e.target.value })}
                />
              </Field>
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-coral-200 bg-coral-50 p-3.5 text-xs font-semibold text-coral-700 text-center">
                {errorMsg}
              </div>
            )}

            <div className="pt-4 border-t border-cream-200">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 text-base font-bold shadow-card"
              >
                {submitting ? '제출 등록 중…' : '✍️ 지원서 최종 제출하기'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
