'use client';

import { HelpButton } from '@/components/help-button';
import type { Role } from '@/auth/permissions';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon';
import { isPrivileged } from '@/auth/permissions';
import { RecruitNav } from '@/components/recruit-nav';
import { Button, Card, DangerButton, Field, Input, SecondaryButton, Select, StatusMessage } from '@/components/ui';
import { DEFAULT_APPLY_FORM, resolveApplyForm, type ApplyFormConfig } from '@/recruit/apply-form';
import { ApplyFormEditor } from './apply-form-editor';
import { ResultMailCard } from './result-mail-card';

export function RecruitNoticeEditPanel({ role }: { role: Role }) {
  // 이 화면의 값은 게이트를 통과한 사람이 **전부** 바꾼다(2026-08-25, 결정 141) —
  // 회장단과 공고 편집 권한이 켜진 팀(홍보팀)이 같은 것을 본다. 결정 140 까지 있던 필드 단위
  // 구분(마감 스위치·합격자 안내문·면접 장소·대기실 업무)은 사용자 지시로 없앴다.
  //
  // canManage 에 남은 일은 **기수 삭제 버튼 하나**뿐이다. 되돌릴 수 없는 정리 작업이라 회장단에
  // 남겨 뒀다. **UI 를 감추는 것은 권한이 아니다**(규칙 #6) — 삭제는 라우트도 회장단만 받는다.
  const canManage = isPrivileged(role);
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
  // 지원자 공개 스위치(면접 일정/링크, 최종 결과). 6번 화면에도 같은 스위치가 있고 같은 API 를 부른다 —
  // 홍보팀은 6번(회장단 전용)에 못 들어가므로 여기에도 둔다(결정 141).
  const [schedulePublic, setSchedulePublic] = useState(false);
  const [resultPublic, setResultPublic] = useState(false);
  const [venuesText, setVenuesText] = useState('학생회관 301호\n학생회관 302호');
  // 면접 당일 대기실 업무 이름들(3번 화면 배정표의 열). 서버가 기본값을 채워 내려보낸다.
  const [dutyRolesText, setDutyRolesText] = useState('');

  // 공개 지원서 양식 설정(문항 문구·안내·선택지). 상세 편집 UI 는 ApplyFormEditor 가 담당한다.
  const [applyForm, setApplyForm] = useState<ApplyFormConfig>(DEFAULT_APPLY_FORM);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [noticeImages, setNoticeImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  const fetchCohorts = useCallback(async (selectIdOverride?: string) => {
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
  }, []);

  const fetchNoticeSettings = useCallback(async () => {
    if (!selectedCohortId) return;
    const res = await fetch(`/api/recruit/notice?cohortId=${selectedCohortId}`);
    const data = await res.json();
    if (data.cohort) {
      setNoticeContent(data.cohort.noticeContent || '');
      setNoticeImages(data.cohort.noticeImages || []);
      setCongratsMessage(data.cohort.congratsMessage || '');
      setPostPassNotice(data.cohort.postPassNotice || '');
      setIsClosed(!!data.cohort.isClosed);
      setSchedulePublic(!!data.cohort.schedulePublic);
      setResultPublic(!!data.cohort.resultPublic);
      // 저장된 적이 없으면 resolveApplyForm 이 기본값을 채워 준다.
      setApplyForm(resolveApplyForm(data.cohort.applyForm));
      setVenuesText((data.cohort.venues || ['학생회관 301호', '학생회관 302호']).join('\n'));
      setDutyRolesText((data.cohort.dutyRoles ?? []).join('\n'));
    }
  }, [selectedCohortId]);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  useEffect(() => {
    if (selectedCohortId) {
      fetchNoticeSettings();
    }
  }, [selectedCohortId, fetchNoticeSettings]);

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

  /** 브라우저에서 긴 변 1200px 로 줄이고 JPEG 로 다시 인코딩한다(업로드·전송량 절약). */
  function downscale(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read_failed'));
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode_failed'));
        img.onload = () => {
          const MAX_WIDTH = 1200;
          let { width, height } = img;
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', 0.85);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  // 이미지는 Supabase Storage 에 올리고 DB 에는 URL 만 저장한다.
  // 예전에는 base64 문자열을 통째로 jsonb 에 넣어서, 포스터 몇 장이면 기수 행 하나가 수 MB 가 됐다
  // (그 행은 공고를 볼 때마다 오간다).
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!selectedCohortId) {
      setMessage('❌ 먼저 모집 기수를 선택해 주세요.');
      e.target.value = '';
      return;
    }

    setUploadingImage(true);
    setMessage('');
    try {
      for (const file of Array.from(files)) {
        const blob = await downscale(file);
        const fd = new FormData();
        fd.set('cohortId', selectedCohortId);
        fd.set('file', new File([blob], 'poster.jpg', { type: 'image/jpeg' }));

        const res = await fetch('/api/recruit/notice/images', { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok && data.url) {
          setNoticeImages((prev) => [...prev, data.url]);
        } else {
          setMessage(`❌ 이미지 업로드 실패: ${data.message || data.error}`);
          break;
        }
      }
    } catch {
      setMessage('❌ 이미지를 처리하지 못했습니다. 다른 파일로 시도해 주세요.');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // 목록에서 빼는 것과 별개로 스토리지 파일도 지운다 — 안 지우면 안 쓰는 이미지가 계속 쌓인다.
  // 삭제가 실패해도 화면에서는 빼 준다(저장을 막을 이유가 없다).
  const handleRemoveImage = (indexToRemove: number) => {
    const url = noticeImages[indexToRemove];
    setNoticeImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    if (url && url.startsWith('http')) {
      void fetch(`/api/recruit/notice/images?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
    }
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
      const dutyRoles = dutyRolesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/recruit/notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 화면에 있는 값은 전부 보낸다(결정 141 — 필드 단위 구분이 없어졌다).
        body: JSON.stringify({
          cohortId: selectedCohortId,
          noticeContent,
          noticeImages,
          applyForm,
          congratsMessage,
          postPassNotice,
          isClosed,
          venues,
          dutyRoles,
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

  /**
   * 지원자 공개 스위치. 두 값을 늘 함께 보낸다 — 서버가 undefined 를 "안 바꿈"으로 읽으므로
   * 하나만 보내도 되지만, 화면이 둘 다 들고 있어 같이 보내는 편이 상태가 어긋날 여지가 없다.
   *
   * 실패하면 **화면 값을 되돌린다**. 안 그러면 체크박스는 켜졌는데 지원자에게는 안 보이는,
   * 가장 알아채기 어려운 어긋남이 생긴다(마감 스위치와 같은 처리).
   */
  const handleUpdateSwitches = async (nextSchedule: boolean, nextResult: boolean) => {
    if (!selectedCohortId) {
      setMessage('❌ 모집 기수를 먼저 선택해 주세요.');
      return;
    }
    const prev = { schedule: schedulePublic, result: resultPublic };
    setSchedulePublic(nextSchedule);
    setResultPublic(nextResult);
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/recruit/cohorts/${selectedCohortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedulePublic: nextSchedule, resultPublic: nextResult }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage('✅ 지원자 공개 설정이 변경되었습니다.');
      } else {
        setSchedulePublic(prev.schedule);
        setResultPublic(prev.result);
        setMessage(`❌ ${data.message || data.error || '공개 설정을 변경하지 못했습니다.'}`);
      }
    } catch (err: any) {
      setSchedulePublic(prev.schedule);
      setResultPublic(prev.result);
      setMessage(`❌ 통신 오류: ${err?.message || '서버에 연결할 수 없습니다.'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-ink-900">0. 모집 공고 및 안내 설정 (회장단·홍보팀)</h1>
            <HelpButton screen="recruit-notice" />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {canManage
              ? '신입 모집 기수 생성/삭제, 공개 공고 포스터/안내문구, 모집 마감 스위치 및 축하 멘트 관리.'
              : '기수 생성, 공개 공고 글·포스터·지원서 문항, 모집 마감 스위치, 합격자 안내문, 공개 스위치까지 맡습니다. 기수 삭제만 회장단이 합니다.'}
          </p>
        </div>

        <div>
          {/* 이 화면에서 가장 자주 누르는 링크인데 흰 바탕에 회색 테두리라 눈에 띄지 않았다.
              파란 테두리·바탕으로 올리고 글자도 키운다. ↗ 문자 대신 external 아이콘을 쓴다 —
              폰트에 따라 ↗ 가 네모로 깨지고 크기도 글자에 끌려다닌다. */}
          <a
            href="/recruit/notice"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-tap items-center gap-2 rounded-xl border-2 border-blue-500 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 no-underline shadow-card transition-colors hover:border-blue-600 hover:bg-blue-100"
          >
            <span>공개 공고 페이지 바로가기</span>
            <Icon name="external" size={16} className="shrink-0" />
          </a>
        </div>
      </div>

      {/* 이 화면까지 온 사람은 게이트를 통과했으므로 0단계는 항상 열려 있다. */}
      <RecruitNav role={role} canEditNotice />

      {/* 모집 기수 선택 및 관리 */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-cream-200 pb-3">
          <h2 className="text-base font-bold text-ink-900">{canManage ? '모집 기수 선택 및 생성 / 삭제' : '모집 기수 선택 및 생성'}</h2>
          <span className="text-xs text-ink-500">
            {canManage ? '새로운 신입 기수를 생성하거나 기존 기수를 관리합니다.' : '공고를 쓸 기수를 고르거나 새로 만듭니다. 삭제는 회장단이 합니다.'}
          </span>
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

          {/* 기수 **생성**은 홍보팀에게도 열려 있다(결정 140) — 공고를 쓰려면 담을 기수가 먼저
              있어야 한다. **삭제는 회장단만**이라 아래 버튼은 canManage 로 가른다. */}
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
              {canManage && selectedCohortId && (
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

      {/* 지원자 공개 스위치. 6번 최종 결정 화면(회장단 전용)에도 같은 스위치가 있고 같은 API 를
          부른다 — 어느 쪽에서 켜도 결과는 같다. 홍보팀은 6번에 못 들어가므로 여기에 둔다(결정 141).
          ⚠ "최종 합격 결과 공개"는 켜는 순간 지원자가 합격 여부를 보고, 되돌려도 이미 본 사람은
             되돌릴 수 없다. 그래서 경고를 옆에 붙이고 서버는 audit 에 [high] 로 남긴다. */}
      <Card className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-ink-900">지원자 공개 설정</h2>
          <p className="mt-1 text-xs text-ink-500">
            켜면 지원자가 <strong>/recruit</strong> 조회에서 바로 볼 수 있습니다. 끄면 결과를 알 수 없습니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-cream-200 bg-cream-50 p-3 px-5 sm:flex-row sm:items-center sm:gap-6">
          <label className="flex min-h-tap cursor-pointer items-center gap-2.5 text-xs font-bold text-ink-900">
            <input
              type="checkbox"
              checked={schedulePublic}
              disabled={saving || !selectedCohortId}
              onChange={(e) => handleUpdateSwitches(e.target.checked, resultPublic)}
              className="h-5 w-5 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
            />
            <span>면접 일정/링크 지원자 공개</span>
          </label>

          <div className="hidden h-4 w-px bg-cream-200 sm:block" />

          <label className="flex min-h-tap cursor-pointer items-center gap-2.5 text-xs font-bold text-ink-900">
            <input
              type="checkbox"
              checked={resultPublic}
              disabled={saving || !selectedCohortId}
              onChange={(e) => handleUpdateSwitches(schedulePublic, e.target.checked)}
              className="h-5 w-5 rounded border-ink-300 text-blue-600 focus:ring-blue-500"
            />
            <span>최종 합격 결과 지원자 공개</span>
          </label>
        </div>
        <p className="text-[11px] text-ink-500">
          <strong className="text-coral-700">최종 합격 결과 공개</strong>는 켜는 즉시 지원자가 합격 여부를 봅니다.
          다시 꺼도 이미 본 사람에게는 되돌려지지 않아요. 회장단이 최종 확정을 마친 뒤에 켜세요.
        </p>
      </Card>

      {/* 결과 안내 메일 — 공개 스위치 바로 아래. 스위치를 켠 다음에 하는 일이라 순서대로 놓는다.
          발송은 스위치에 자동으로 붙이지 않는다(결정 148 — 스위치는 되돌릴 수 있고 메일은 아니다). */}
      {selectedCohortId && (
        <ResultMailCard
          cohortId={selectedCohortId}
          schedulePublic={schedulePublic}
          resultPublic={resultPublic}
        />
      )}

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

            <label
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors ${
                uploadingImage ? 'cursor-not-allowed bg-ink-300' : 'cursor-pointer bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <span>{uploadingImage ? '올리는 중…' : '이미지 파일 추가'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploadingImage}
                onChange={handleImageFileUpload}
                className="hidden"
              />
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

            <h2 className="text-base font-bold text-ink-900">대기실 업무 목록 (줄바꿈 구분)</h2>
            <Field
              label="면접 당일 대기실 업무"
              hint="면접관 말고 명단 체크·안내·인솔을 맡는 자리입니다. 3번 화면의 대기실 배정표 열이 됩니다. 이름을 지우면 그 업무의 배정도 함께 지워집니다."
            >
              <textarea
                className="w-full h-20 rounded-xl border border-ink-200 bg-white p-3 text-xs font-sans text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500"
                placeholder="면접자 명단 체크&#10;대기실 안내&#10;면접장 인솔a&#10;면접장 인솔b"
                value={dutyRolesText}
                onChange={(e) => setDutyRolesText(e.target.value)}
              />
            </Field>
        </div>

        {/* 공개 지원서(/recruit/apply)의 선택지·문항. 예전에는 화면 코드에 박혀 있어
            바꾸려면 배포가 필요했다. 지망 팀 목록은 여기가 아니라 "회원 관리"의 팀이 그대로 쓰인다. */}
        {/* 공개 지원서(/recruit/apply)의 문항·안내·선택지. 예전에는 화면 코드에 박혀 있어
            바꾸려면 배포가 필요했다. 항목 구성 자체는 recruit_applicants 컬럼과 묶여 있어 고정이고,
            여기서 바꾸는 것은 문구·안내·선택지·필수 여부다. */}
        <div className="border-t border-cream-200 pt-6 space-y-4">
          <h2 className="text-base font-bold text-ink-900">지원서 양식 설정</h2>
          <ApplyFormEditor value={applyForm} onChange={setApplyForm} />
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

