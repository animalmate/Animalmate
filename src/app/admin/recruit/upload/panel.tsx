'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function RecruitUploadPanel() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [newCohortLabel, setNewCohortLabel] = useState('');
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    name: '',
    phone: '',
    gender: '',
    birthDate: '',
    school: '',
    department: '',
    email: '',
    applyRoute: '',
    otherActivities: '',
    expectedFrequency: '',
    wishTeam1: '',
    wishTeam2: '',
    nearStation: '',
    otAttend: '',
    remoteInterviewWish: '',
    essayIntro: '',
    essayValues: '',
  });

  const [previewResult, setPreviewResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fieldLabels: Record<string, string> = {
    name: '이름 (필수)',
    phone: '전화번호 (필수)',
    gender: '성별',
    birthDate: '생년월일',
    school: '학교',
    department: '학과',
    email: '이메일',
    applyRoute: '지원경로',
    otherActivities: '대외활동/알바',
    expectedFrequency: '예상 참여주기',
    wishTeam1: '지망팀 1',
    wishTeam2: '지망팀 2',
    nearStation: '가장 가까운 역 (주소)',
    otAttend: 'OT 참가 여부',
    remoteInterviewWish: '비대면 면접 희망',
    essayIntro: '자기소개',
    essayValues: '가치관',
  };

  useEffect(() => {
    fetchCohorts();
  }, []);

  const fetchCohorts = async () => {
    const res = await fetch('/api/recruit/cohorts');
    const data = await res.json();
    if (data.cohorts) {
      setCohorts(data.cohorts);
      if (data.cohorts.length > 0 && !selectedCohortId) {
        setSelectedCohortId(data.cohorts[0].id);
      }
    }
  };

  const handleCreateCohort = async () => {
    if (!newCohortLabel.trim()) return;
    const res = await fetch('/api/recruit/cohorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newCohortLabel.trim() }),
    });
    const data = await res.json();
    if (data.cohort) {
      setNewCohortLabel('');
      await fetchCohorts();
      setSelectedCohortId(data.cohort.id);
    }
  };

  const handleCsvInput = (text: string) => {
    setCsvText(text);
    const lines = text.trim().split('\n');
    if (lines.length > 0 && lines[0]) {
      const firstLine = lines[0].replace(/^\uFEFF/, '');
      const parsedHeaders = firstLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim());
      setHeaders(parsedHeaders);

      const autoMapping = { ...mapping };
      parsedHeaders.forEach((h) => {
        if (h.includes('이름')) autoMapping.name = h;
        if (h.includes('전화') || h.includes('연락처')) autoMapping.phone = h;
        if (h.includes('성별')) autoMapping.gender = h;
        if (h.includes('생년월일')) autoMapping.birthDate = h;
        if (h.includes('학교')) autoMapping.school = h;
        if (h.includes('학과')) autoMapping.department = h;
        if (h.includes('메일')) autoMapping.email = h;
        if (h.includes('경로')) autoMapping.applyRoute = h;
        if (h.includes('역') || h.includes('주소')) autoMapping.nearStation = h;
        if (h.includes('소개')) autoMapping.essayIntro = h;
        if (h.includes('가치관')) autoMapping.essayValues = h;
      });
      setMapping(autoMapping);
    }
  };

  const handlePreview = async () => {
    if (!selectedCohortId || !csvText) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/recruit/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          csvText,
          mapping,
          confirmImport: false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreviewResult(data);
      } else {
        setMessage(`미리보기 오류: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!selectedCohortId || !csvText) return;
    setLoading(true);
    try {
      const res = await fetch('/api/recruit/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          csvText,
          mapping,
          confirmImport: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ 업로드 성공! 총 ${data.importedCount}명 등록됨 (기존 중복 ${data.skippedCount}명 자동 제외)`);
        setPreviewResult(null);
      } else {
        setMessage(`❌ 업로드 실패: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold text-ink-900">1. 지원자 데이터 업로드</h1>
        <p className="mt-1 text-sm text-ink-500">구글 폼 지원서 CSV 데이터를 파싱하여 기수별 지원자 DB를 등록합니다.</p>
      </div>

      <RecruitNav />

      <div className="space-y-6">
        {/* Step 1: 기수 선택 */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2 border-b border-cream-200 pb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">1</span>
            <h2 className="text-base font-bold text-ink-900">모집 기수 선택 및 생성</h2>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[240px]">
              <Field label="모집 기수">
                <Select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)}>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({new Date(c.createdAt).toLocaleDateString('ko-KR')})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex items-end gap-2 flex-1 min-w-[260px]">
              <div className="flex-1">
                <Field label="새 기수 추가">
                  <Input
                    type="text"
                    placeholder="예: 2026-2 신입 모집 (F9)"
                    value={newCohortLabel}
                    onChange={(e) => setNewCohortLabel(e.target.value)}
                  />
                </Field>
              </div>
              <Button type="button" onClick={handleCreateCohort} className="h-control">
                + 기수 생성
              </Button>
            </div>
          </div>
        </Card>

        {/* Step 2: CSV 붙여넣기 및 컬럼 매핑 */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2 border-b border-cream-200 pb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">2</span>
            <h2 className="text-base font-bold text-ink-900">CSV 데이터 붙여넣기 및 열 매핑</h2>
          </div>

          <Field label="CSV 텍스트" hint="구글 폼 스프레드시트에서 전체 데이터를 복사(Ctrl+A, Ctrl+C)하여 붙여넣으세요.">
            <textarea
              className="w-full h-44 rounded-xl border-[1.5px] border-ink-200 bg-white p-3.5 text-xs font-mono text-ink-900 outline-none placeholder:text-ink-400 focus:border-blue-500 leading-relaxed"
              placeholder="타임스탬프,이름,전화번호,성별,학교,학과..."
              value={csvText}
              onChange={(e) => handleCsvInput(e.target.value)}
            />
          </Field>

          {headers.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-bold text-ink-900">헤더↔지원자 필드 매핑</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.keys(fieldLabels).map((fieldKey) => (
                  <div key={fieldKey} className="flex items-center justify-between gap-2 rounded-xl border border-cream-200 bg-cream-25 p-2.5">
                    <span className="text-xs font-semibold text-ink-900 truncate">{fieldLabels[fieldKey]}</span>
                    <select
                      value={mapping[fieldKey] || ''}
                      onChange={(e) => setMapping({ ...mapping, [fieldKey]: e.target.value })}
                      className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-900 outline-none max-w-[140px]"
                    >
                      <option value="">-- 미매핑 --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Button type="button" disabled={loading} onClick={handlePreview}>
                  {loading ? '검증 중…' : '미리보기 & 중복 검사'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Step 3: 검증 결과 및 업로드 확정 */}
        {previewResult && (
          <Card className="space-y-4 border-blue-200 bg-blue-50/30">
            <div className="flex items-center gap-2 border-b border-blue-100 pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">3</span>
              <h2 className="text-base font-bold text-ink-900">파싱 미리보기 및 최종 확정</h2>
            </div>

            <div className="grid grid-cols-3 gap-4 rounded-xl bg-white p-4 shadow-sm text-center">
              <div>
                <div className="text-xs font-medium text-ink-500">파싱된 전체</div>
                <div className="text-xl font-bold text-ink-900 mt-0.5">{previewResult.totalParsed}명</div>
              </div>
              <div>
                <div className="text-xs font-medium text-ink-500">중복 감지 제외</div>
                <div className="text-xl font-bold text-coral-600 mt-0.5">{previewResult.duplicateCount}명</div>
              </div>
              <div>
                <div className="text-xs font-medium text-ink-500">신규 등록 예정</div>
                <div className="text-xl font-bold text-blue-600 mt-0.5">{previewResult.uniqueCount}명</div>
              </div>
            </div>

            <h3 className="text-xs font-bold text-ink-700">등록 예정 지원자 샘플 (상위 5건)</h3>
            <div className="overflow-x-auto rounded-xl border border-cream-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-cream-100 text-ink-700 font-semibold">
                  <tr>
                    <th className="p-3">이름</th>
                    <th className="p-3">전화번호</th>
                    <th className="p-3">학교 / 학과</th>
                    <th className="p-3">인근 역 (주소)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {previewResult.sample?.map((s: any, idx: number) => {
                    const hasAddressPattern = s.nearStation && /[시구동번지]/.test(s.nearStation);
                    return (
                      <tr key={idx} className="hover:bg-cream-25">
                        <td className="p-3 font-bold text-ink-900">{s.name}</td>
                        <td className="p-3 font-mono text-ink-700">{s.phone}</td>
                        <td className="p-3 text-ink-700">{s.school} {s.department}</td>
                        <td className="p-3 text-ink-700">
                          {s.nearStation}
                          {hasAddressPattern && (
                            <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                              ⚠️ 주소 감지 (역명 정제 추천)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                disabled={loading || previewResult.uniqueCount === 0}
                onClick={handleConfirmUpload}
              >
                {loading ? '업로드 등록 중…' : `최종 ${previewResult.uniqueCount}명 DB 등록 확정`}
              </Button>
            </div>
          </Card>
        )}

        {message && (
          <div className="rounded-xl border border-cream-200 bg-white p-4 text-sm font-semibold text-ink-900 shadow-card">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
