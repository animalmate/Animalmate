'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/icon';
import { RecruitNav } from '@/components/recruit-nav';
import { Button, Card, DangerButton, Field, Input, SecondaryButton, Select, StatusMessage } from '@/components/ui';

export function RecruitNoticeEditPanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  // 기수 목록을 받아오는 동안 셀렉트에 표시한다(빈 드롭다운 = '기수 없음' 오해 방지).
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [newCohortLabel, setNewCohortLabel] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [noticeContent, setNoticeContent] = useState('');
  const [congratsMessage, setCongratsMessage] = useState('');
  const [postPassNotice, setPostPassNotice] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [venuesText, setVenuesText] = useState('학생회관 301호\n학생회관 302호');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [noticeImages, setNoticeImages] = useState<string[]>([]);

  useEffect(() => {
    fetchCohorts();
  }, []);

  useEffect(() => {
    if (selectedCohortId) {
      fetchNoticeSettings();
    }
  }, [selectedCohortId]);

  const fetchCohorts = async (selectIdOverride?: string) => {
    try {
      try {
        const res = await fetch('/api/recruit/cohorts');
        const data = await res.json();
        const list = data.cohorts || [];
        setCohorts(list);
        if (list.length > 0) {
          setSelectedCohortId((prev) => {
            const targetId = selectIdOverride || prev;
            const exists = list.some((c: any) => c.id === targetId);
            return exists ? targetId : list[0].id;
          });
        } else {
          setSelectedCohortId('');
        }
      } catch (e) {
        console.error('Failed to fetch cohorts', e);
      }
    } finally {
      setCohortsLoading(false);
    }
  };

  const handleCreateCohort = async () => {
    if (!newCohortLabel.trim()) {
      setMessage('❌ 생성할 기수 이름을 입력해주세요 (예: 33기).');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newCohortLabel.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.cohort) {
        setNewCohortLabel('');
        setSelectedCohortId(data.cohort.id);
        await fetchCohorts(data.cohort.id);
        setMessage(`✅ 모집 기수 [${data.cohort.label}]가 성공적으로 생성 및 선택되었습니다.`);
      } else {
        setMessage(`❌ 기수 생성 실패 (${res.status}): ${data.message || data.error || '오류가 발생했습니다.'}`);
      }
    } catch (err: any) {
      setMessage(`❌ 통신/전송 오류: ${err?.message || '서버 응답을 불러올 수 없습니다.'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCohort = async () => {
    if (!selectedCohortId) return;
    setSaving(true);
    try {
      const selectedLabel = cohorts.find((c) => c.id === selectedCohortId)?.label;
      // 서버가 기수 명칭 재입력을 2단계 확인으로 요구한다(09-RECRUIT-DESIGN §8).
      // 지원자가 남아 있으면 서버가 409 로 거절하고 폐기 절차로 유도한다.
      const res = await fetch(
        `/api/recruit/cohorts/${selectedCohortId}?confirmLabel=${encodeURIComponent(selectedLabel ?? '')}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setMessage(`기수 [${selectedLabel}]가 삭제되었습니다.`);
        setShowDeleteModal(false);
        const remaining = cohorts.filter((c) => c.id !== selectedCohortId);
        setCohorts(remaining);
        setSelectedCohortId(remaining.length > 0 ? remaining[0]!.id : '');
      } else {
        const data = await res.json();
        setMessage(`삭제 실패: ${data.message || data.error}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const fetchNoticeSettings = async () => {
    if (!selectedCohortId) return;
    const res = await fetch(`/api/recruit/notice?cohortId=${selectedCohortId}`);
    const data = await res.json();
    if (data.cohort) {
      setNoticeContent(data.cohort.noticeContent || '');
      setNoticeImages(data.cohort.noticeImages || []);
      setCongratsMessage(data.cohort.congratsMessage || '');
      setPostPassNotice(data.cohort.postPassNotice || '');
      setIsClosed(!!data.cohort.isClosed);
      setVenuesText((data.cohort.venues || ['학생회관 301호', '학생회관 302호']).join('\n'));
    }
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          setNoticeImages((prev) => [...prev, compressedBase64]);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setNoticeImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveSettings = async () => {
    if (!selectedCohortId) {
      setMessage('❌ 선택된 모집 기수가 없습니다. 먼저 기수를 생성하거나 선택해 주세요.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
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

      const data = await res.json();
      if (res.ok) {
        setMessage('✅ 모집 공고 본문, 포스터 이미지, 마감 스위치 및 안내 설정이 DB에 성공적으로 저장되었습니다.');
      } else {
        setMessage(`❌ 저장 실패 (${res.status}): ${data.message || data.error || '알 수 없는 서버 오류'}`);
      }
    } catch (err: any) {
      setMessage(`❌ 통신/전송 오류: ${err?.message || '서버 응답을 불러올 수 없습니다.'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClosed = async () => {
    if (!selectedCohortId) {
      setMessage('❌ 모집 기수가 먼저 생성 및 선택되어야 모집 상태를 변경할 수 있습니다.');
      return;
    }
    const nextIsClosed = !isClosed;
    setIsClosed(nextIsClosed);
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
        setIsClosed(!nextIsClosed);
        const data = await res.json();
        setMessage(`❌ 변경 실패 (${res.status}): ${data.message || data.error || '오류가 발생했습니다.'}`);
      }
    } catch (err: any) {
      setIsClosed(!nextIsClosed);
      setMessage(`❌ 통신 오류: ${err?.message || '서버에 연결할 수 없습니다.'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">0. 모집 공고 및 안내 설정 (홍보팀·회장단)</h1>
          <p className="mt-1 text-sm text-ink-500">신입 모집 기수 생성/삭제, 공개 공고 포스터/안내문구, 모집 마감 스위치 및 축하 멘트 관리.</p>
        </div>

        <div>
          <a
            href="/recruit/notice"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-cream-100 text-ink-900 border border-ink-200 rounded-xl text-xs font-bold transition-all shadow-sm no-underline"
          >
            <span>공개 공고 페이지 바로가기 ↗</span>
          </a>
        </div>
      </div>

      <RecruitNav />

      {/* 모집 기수 선택 및 관리 */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-cream-200 pb-3">
          <h2 className="text-base font-bold text-ink-900">모집 기수 선택 및 생성 / 삭제</h2>
          <span className="text-xs text-ink-500">새로운 신입 기수를 생성하거나 기존 기수를 관리합니다.</span>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px]">
            <Field label="현재 선택된 모집 기수">
              <Select loading={cohortsLoading} value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)}>
                {cohorts.length > 0 ? (
                  cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))
                ) : (
                  <option value="">등록된 모집 기수가 없습니다. (오른쪽에서 새 기수를 생성해 주세요)</option>
                )}
              </Select>
            </Field>
          </div>

          <div className="flex items-end gap-2 flex-1 min-w-[320px]">
            <div className="flex-1">
              <Field label="새 신입 기수 생성">
                <Input
                  type="text"
                  placeholder="예: 33기 (또는 34기)"
                  value={newCohortLabel}
                  onChange={(e) => setNewCohortLabel(e.target.value)}
                />
              </Field>
            </div>
            <Button type="button" onClick={handleCreateCohort} className="h-control whitespace-nowrap">
              + 기수 생성
            </Button>
            {selectedCohortId && (
              <DangerButton
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="h-control whitespace-nowrap"
              >
                기수 삭제
              </DangerButton>
            )}
          </div>
        </div>
      </Card>

      {/* 모집 마감 스위치 바 */}
      <Card className="p-5 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-cream-50 to-blue-50/40 border-cream-200 shadow-card">
        <div className="flex items-center gap-3">
          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl font-bold ${isClosed ? 'bg-coral-100 text-coral-700' : 'bg-emerald-100 text-emerald-800'}`}>
            <Icon name={isClosed ? "alert" : "megaphone"} size={18} />
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
          {saving ? '상태 변경 중…' : isClosed ? '모집 재개하기 (지원서 열기)' : '모집 중단하기 (지원 마감)'}
        </button>
      </Card>

      {/* 설정 입력 카드 */}
      <Card className="space-y-6">
        <div className="border-b border-cream-200 pb-3">
          <h2 className="text-base font-bold text-ink-900">공개 모집 공고 내용 및 이미지</h2>
        </div>

        <Field label="모집 공고 상세 안내글 (마크다운 / 일반 텍스트)" hint="공개 공고 페이지(/recruit/notice)에 표시될 전체 안내글">
          <textarea
            className="w-full h-44 rounded-xl border border-ink-200 bg-white p-3.5 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500 font-sans leading-relaxed"
            placeholder="[동아리 신입 부원 모집 안내]&#10;안녕하세요, 유기동물 봉사 동아리 애니멀메이트입니다..."
            value={noticeContent}
            onChange={(e) => setNoticeContent(e.target.value)}
          />
        </Field>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-ink-900 block">모집 포스터 및 안내 이미지 첨부</label>
              <p className="text-[11px] text-ink-500">컴퓨터에서 포스터 이미지 파일(PNG, JPG, WEBP)을 선택하여 바로 첨부할 수 있습니다.</p>
            </div>

            <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all">
              <span>이미지 파일 추가</span>
              <input type="file" accept="image/*" multiple onChange={handleImageFileUpload} className="hidden" />
            </label>
          </div>

          {/* 이미지 썸네일 그리드 */}
          {noticeImages.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {noticeImages.map((imgUrl, idx) => (
                <div key={idx} className="relative group rounded-xl border border-cream-200 bg-cream-50 overflow-hidden shadow-xs">
                  <img src={imgUrl} alt={`첨부 이미지 ${idx + 1}`} className="w-full h-32 object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1.5 right-1.5 bg-ink-900/80 text-white text-[11px] font-bold px-2 py-0.5 rounded-md hover:bg-coral-600 transition-colors"
                  >
                    ✕ 삭제
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-ink-200 rounded-xl p-6 text-center text-xs text-ink-400">
              첨부된 포스터 이미지가 없습니다. 상단 '이미지 파일 추가' 버튼을 눌러 컴퓨터에 있는 이미지 파일(JPG, PNG)을 선택해주세요.
            </div>
          )}
        </div>

        <div className="border-t border-cream-200 pt-6 space-y-4">
          <h2 className="text-base font-bold text-ink-900">대면 면접 장소 프리셋 (줄바꿈 구분)</h2>
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
          <h2 className="text-base font-bold text-ink-900">최종 합격자 축하 멘트 및 합격 후 안내</h2>

          <Field label="최종 합격 축하 멘트" hint="합격자가 결과 조회 시 표시되는 축하 멘트">
            <Input
              type="text"
              placeholder="축하합니다! 애니멀메이트 33기 신입 부원으로 최종 합격하셨습니다."
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

        <StatusMessage text={message} />

        <div className="flex justify-end pt-2">
          <Button type="button" disabled={saving} onClick={handleSaveSettings} className="h-control px-8 text-sm font-bold">
            {saving ? '저장 중…' : '공고 및 안내 설정 저장'}
          </Button>
        </div>
      </Card>

      {/* 기수 삭제 경고 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-ink-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4 shadow-modal rounded-3xl border-coral-100 bg-white">
            <div className="flex items-center gap-3 text-coral-700">
              <Icon name="alert" size={24} className="text-coral-600" />
              <h2 className="text-lg font-bold text-ink-900">정말 이 기수를 삭제하시겠습니까?</h2>
            </div>
            <p className="text-xs text-ink-500 leading-relaxed">
              선택하신 <strong className="text-ink-900 font-bold">[{cohorts.find(c => c.id === selectedCohortId)?.label}]</strong> 기수와 관련된 모든 모집 공고, 지원서 및 채점 데이터가 원복 불가능하게 파기됩니다. 계속 진행할까요?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setShowDeleteModal(false)}>
                취소
              </SecondaryButton>
              <DangerButton type="button" disabled={saving} onClick={handleDeleteCohort}>
                {saving ? '삭제 중…' : '네, 정말 삭제합니다'}
              </DangerButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

