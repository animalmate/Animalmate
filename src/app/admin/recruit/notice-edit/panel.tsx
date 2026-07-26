'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function RecruitNoticeEditPanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');

  const [noticeContent, setNoticeContent] = useState('');
  const [noticeImagesText, setNoticeImagesText] = useState('');
  const [congratsMessage, setCongratsMessage] = useState('');
  const [postPassNotice, setPostPassNotice] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [venuesText, setVenuesText] = useState('학생회관 301호\n학생회관 302호');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCohorts();
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchNoticeSettings();
    }
  }, [selectedCohortId]);

  const fetchCohorts = async () => {
    const res = await fetch('/api/recruit/cohorts');
    const data = await res.json();
    if (data.cohorts && data.cohorts.length > 0) {
      setCohorts(data.cohorts);
      setSelectedCohortId(data.cohorts[0].id);
    }
  };

  const fetchNoticeSettings = async () => {
    const res = await fetch(`/api/recruit/notice?cohortId=${selectedCohortId}`);
    const data = await res.json();
    if (data.cohort) {
      setNoticeContent(data.cohort.noticeContent || '');
      setNoticeImagesText((data.cohort.noticeImages || []).join('\n'));
      setCongratsMessage(data.cohort.congratsMessage || '');
      setPostPassNotice(data.cohort.postPassNotice || '');
      setIsClosed(!!data.cohort.isClosed);
      setVenuesText((data.cohort.venues || ['학생회관 301호', '학생회관 302호']).join('\n'));
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedCohortId) return;
    setSaving(true);
    setMessage('');
    try {
      const noticeImages = noticeImagesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const venues = venuesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/recruit/notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          noticeContent,
          noticeImages,
          congratsMessage,
          postPassNotice,
          isClosed,
          venues,
        }),
      });

      if (res.ok) {
        setMessage('✅ 모집 공고, 마감 스위치 및 안내 설정이 성공적으로 저장되었습니다.');
      } else {
        const data = await res.json();
        setMessage(`❌ 저장 실패: ${data.error}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClosed = async () => {
    const nextIsClosed = !isClosed;
    setIsClosed(nextIsClosed);
    if (!selectedCohortId) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          isClosed: nextIsClosed,
        }),
      });
      if (res.ok) {
        setMessage(`✅ 모집 상태가 [${nextIsClosed ? '모집 중단 / 마감' : '모집 진행 중'}]으로 즉시 변경 및 저장되었습니다.`);
      } else {
        const data = await res.json();
        setMessage(`❌ 변경 실패: ${data.error}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">0. 모집 공고 및 안내 설정 (홍보팀·회장단)</h1>
          <p className="mt-1 text-sm text-ink-500">공개 공고 문구, 이미지, 모집 중단(마감) 스위치, 대면 면접 장소 프리셋 및 축하 멘트 관리.</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">기수:</span>
          <Select
            value={selectedCohortId}
            onChange={(e) => setSelectedCohortId(e.target.value)}
            className="w-48"
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <RecruitNav />

      {/* 모집 마감 스위치 바 */}
      <Card className="p-5 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-cream-50 to-blue-50/40 border-cream-200 shadow-card">
        <div className="flex items-center gap-3">
          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl font-bold ${isClosed ? 'bg-coral-100 text-coral-700' : 'bg-emerald-100 text-emerald-800'}`}>
            {isClosed ? '🔒' : '📢'}
          </span>
          <div>
            <div className="text-sm font-bold text-ink-900 flex items-center gap-2">
              현재 모집 상태: 
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${isClosed ? 'bg-coral-100 text-coral-700' : 'bg-emerald-100 text-emerald-800'}`}>
                {isClosed ? '모집 중단 / 마감됨' : '모집 진행 중 (지원 가능)'}
              </span>
            </div>
            <p className="text-xs text-ink-500 mt-1">
              모집 중단 스위치를 켜면 지원서 작성 페이지 버튼이 즉시 비활성화되고 마감 팝업이 노출됩니다.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={handleToggleClosed}
          className={`px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-card cursor-pointer ${
            isClosed
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
              : 'bg-coral-600 text-white hover:bg-coral-700 active:scale-95'
          }`}
        >
          {saving ? '상태 변경 중…' : isClosed ? '🔓 모집 재개하기 (지원서 열기)' : '🛑 모집 중단하기 (지원 마감)'}
        </button>
      </Card>

      {/* 설정 입력 카드 */}
      <Card className="space-y-6">
        <div className="border-b border-cream-200 pb-3">
          <h2 className="text-base font-bold text-ink-900">📋 공개 모집 공고 내용 및 이미지</h2>
        </div>

        <Field label="모집 공고 상세 안내글 (마크다운 / 일반 텍스트)" hint="공개 공고 페이지(/recruit/notice)에 표시될 전체 안내글">
          <textarea
            className="w-full h-44 rounded-xl border border-ink-200 bg-white p-3.5 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500 font-sans leading-relaxed"
            placeholder="[동아리 신입 부원 모집 안내]&#10;안녕하세요, 유기동물 봉사 동아리 애니멀메이트입니다..."
            value={noticeContent}
            onChange={(e) => setNoticeContent(e.target.value)}
          />
        </Field>

        <Field label="모집 포스터/안내 이미지 URL 리스트 (줄바꿈 구분)" hint="공고 상단에 노출할 포스터 이미지 웹 URL">
          <textarea
            className="w-full h-24 rounded-xl border border-ink-200 bg-white p-3.5 text-xs font-mono text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500 leading-relaxed"
            placeholder="https://example.com/poster1.png&#10;https://example.com/poster2.png"
            value={noticeImagesText}
            onChange={(e) => setNoticeImagesText(e.target.value)}
          />
        </Field>

        <div className="border-t border-cream-200 pt-6 space-y-4">
          <h2 className="text-base font-bold text-ink-900">📍 대면 면접 장소 프리셋 (줄바꿈 구분)</h2>
          <Field label="대면 면접 장소 후보 목록" hint="면접 배정 시 클릭 한 번으로 선택 가능한 장소 프리셋입니다. (최대 2~3곳)">
            <textarea
              className="w-full h-20 rounded-xl border border-ink-200 bg-white p-3 text-xs font-sans text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500"
              placeholder="학생회관 301호&#10;학생회관 302호"
              value={venuesText}
              onChange={(e) => setVenuesText(e.target.value)}
            />
          </Field>
        </div>

        <div className="border-t border-cream-200 pt-6 space-y-4">
          <h2 className="text-base font-bold text-ink-900">🏆 최종 합격자 축하 멘트 및 합격 후 안내</h2>

          <Field label="최종 합격 축하 멘트" hint="합격자가 결과 조회 시 표시되는 축하 멘트">
            <Input
              type="text"
              placeholder="🎉 축하합니다! 애니멀메이트 33기 신입 부원으로 최종 합격하셨습니다."
              value={congratsMessage}
              onChange={(e) => setCongratsMessage(e.target.value)}
            />
          </Field>

          <Field label="합격 후 안내 사항 (단톡방 링크, 첫 모임 날짜 등)" hint="합격자에게 노출될 입부 안내 사항">
            <textarea
              className="w-full h-28 rounded-xl border border-ink-200 bg-white p-3.5 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500 font-sans leading-relaxed"
              placeholder="1. 신입 부원 카카오톡 단톡방 입장 링크: https://open.kakao.com/...&#10;2. 신입 OT 일정: 8월 10일(토) 15시 학생회관 대강당"
              value={postPassNotice}
              onChange={(e) => setPostPassNotice(e.target.value)}
            />
          </Field>
        </div>

        {message && (
          <div className="rounded-xl border border-cream-200 bg-cream-50 p-4 text-xs font-semibold text-ink-900">
            {message}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button type="button" disabled={saving} onClick={handleSaveSettings} className="h-control px-8 text-sm font-bold">
            {saving ? '저장 중…' : '💾 공고 및 안내 설정 저장'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

