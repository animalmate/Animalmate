'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card } from '@/components/ui';

export default function PublicRecruitNoticePage() {
  const [cohort, setCohort] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showClosedModal, setShowClosedModal] = useState(false);

  useEffect(() => {
    fetchNotice();
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    return () => clearTimeout(safetyTimer);
  }, []);

  const fetchNotice = async () => {
    try {
      const res = await fetch('/api/recruit/notice', { cache: 'no-store' });
      if (!res.ok) {
        setCohort(null);
        return;
      }
      const data = await res.json();
      if (data && data.cohort) {
        setCohort(data.cohort);
      } else {
        setCohort(null);
      }
    } catch (e) {
      setCohort(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyClick = () => {
    if (cohort?.isClosed) {
      setShowClosedModal(true);
      return;
    }
    window.location.href = '/recruit/apply';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
        <p className="text-sm font-semibold text-ink-500">모집 공고를 불러오는 중입니다…</p>
      </div>
    );
  }

  if (!cohort) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream-50 via-white to-cream-100 flex items-center justify-center p-4 font-sans">
        <Card className="max-w-md w-full p-8 text-center space-y-4 shadow-modal rounded-3xl border-cream-200 bg-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cream-100 text-ink-700 text-3xl font-bold">
            🐾
          </div>
          <h1 className="text-xl font-bold text-ink-900">현재 진행 중인 모집 공고가 없습니다</h1>
          <p className="text-xs text-ink-500 leading-relaxed">
            아직 모집 공고가 등록되지 않았거나 기수가 준비 중입니다.<br />
            운영진 콘솔에서 모집 기수 및 공고를 등록하면 이곳에 포스터와 지원서 작성 버튼이 노출됩니다!
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <a
              href="/recruit"
              className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl no-underline transition-all shadow-sm"
            >
              지원 결과 조회하기 🔍
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-white to-cream-100 p-4 sm:p-8 font-sans">
      <head>
        <title>{cohort ? `${cohort.label} 신입 부원 모집 공고 - 애니멀메이트` : '신입 부원 모집 공고'}</title>
      </head>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* 공고 헤더 카너 */}
        <Card className="p-8 text-center space-y-4 bg-white/90 backdrop-blur-md shadow-modal rounded-3xl border-cream-200">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-400 text-white shadow-card">
            <span className="text-3xl font-bold">🐾</span>
          </div>
          <div>
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
              {cohort?.label || '신입 기수'} 모집
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink-900 mt-2">
              유기동물 봉사 동아리 애니멀메이트 신입 모집
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-ink-500">
              아이들을 사랑하고 동아리 활동을 함께 만들어갈 열정 넘치는 신입 부원을 기다립니다.
            </p>
          </div>

          <div className="pt-2">
            <Button
              type="button"
              disabled={cohort?.isClosed}
              onClick={handleApplyClick}
              className={`w-full sm:w-auto px-8 h-12 text-base font-bold shadow-card transition-all ${
                cohort?.isClosed ? 'opacity-60 cursor-not-allowed bg-ink-400' : 'hover:scale-[1.02]'
              }`}
            >
              {cohort?.isClosed ? '🔒 모집이 마감되었습니다' : '✍️ 지원서 작성하기'}
            </Button>
          </div>
        </Card>

        {/* 공고 본문 이미지 및 텍스트 */}
        <Card className="p-6 sm:p-8 space-y-6 bg-white shadow-card rounded-3xl border-cream-200">
          <h2 className="text-lg font-bold text-ink-900 border-b border-cream-200 pb-3">
            📋 모집 요강 및 안내 사항
          </h2>

          {/* 공고 이미지 리스트 */}
          {cohort?.noticeImages && cohort.noticeImages.length > 0 && (
            <div className="space-y-4">
              {cohort.noticeImages.map((url: string, idx: number) => (
                <img
                  key={idx}
                  src={url}
                  alt={`모집 공고 이미지 ${idx + 1}`}
                  className="w-full rounded-2xl border border-cream-200 shadow-sm object-cover"
                />
              ))}
            </div>
          )}

          {/* 공고 본문 텍스트 */}
          <div className="prose max-w-none text-sm text-ink-900 leading-relaxed whitespace-pre-wrap font-sans">
            {cohort?.noticeContent || (
              <div className="text-center py-8 text-ink-400">
                상세 모집 요강 및 공고 텍스트가 준비 중입니다.
              </div>
            )}
          </div>

          {/* 하단 지원하기 버튼 */}
          <div className="pt-6 border-t border-cream-200 text-center">
            <Button
              type="button"
              disabled={cohort?.isClosed}
              onClick={handleApplyClick}
              className="w-full sm:w-80 h-12 text-base font-bold shadow-card"
            >
              {cohort?.isClosed ? '🔒 모집이 마감되었습니다' : '✍️ 지금 지원서 작성하기'}
            </Button>
          </div>
        </Card>
      </div>

      {/* 모집 마감 안내 팝업 모달 */}
      {showClosedModal && (
        <div className="fixed inset-0 bg-ink-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 text-center space-y-4 shadow-modal rounded-3xl border-amber-200">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 text-2xl font-bold">
              🔒
            </div>
            <h2 className="text-lg font-bold text-ink-900">신입 모집이 마감되었습니다</h2>
            <p className="text-xs text-ink-500 leading-relaxed">
              성원에 감사드립니다! 이번 기수의 신입 모집이 마감되어 지원서 접수가 종료되었습니다. 다음 모집 기수에서 만나요!
            </p>
            <div className="pt-2">
              <Button type="button" onClick={() => setShowClosedModal(false)} className="w-full">
                확인
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
