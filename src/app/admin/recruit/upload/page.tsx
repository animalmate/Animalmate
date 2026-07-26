'use client';

import React, { useState, useEffect } from 'react';
import { RecruitNav } from '@/components/recruit-nav';

export default function RecruitUploadPage() {
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

      // 자동 헤더 매핑 시도
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
        setMessage(`업로드 성공! ${data.importedCount}명 등록됨 (중복 제외 ${data.skippedCount}명)`);
        setPreviewResult(null);
      } else {
        setMessage(`업로드 실패: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">F9 신입 모집 관리</h1>
      <RecruitNav />

      <div className="space-y-6">
        {/* 1. 기수 선택 및 생성 */}
        <div className="p-4 border border-border rounded-xl bg-card">
          <h2 className="text-base font-bold text-foreground mb-3">1. 기수 (Cohort) 선택</h2>
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={selectedCohortId}
              onChange={(e) => setSelectedCohortId(e.target.value)}
              className="p-2 border border-input rounded-lg text-sm bg-background"
            >
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({new Date(c.createdAt).toLocaleDateString()})
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="새 기수 이름 (예: 2026-2 신입)"
                value={newCohortLabel}
                onChange={(e) => setNewCohortLabel(e.target.value)}
                className="p-2 border border-input rounded-lg text-sm bg-background"
              />
              <button
                type="button"
                onClick={handleCreateCohort}
                className="px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg"
              >
                + 기수 생성
              </button>
            </div>
          </div>
        </div>

        {/* 2. CSV 입력 및 매핑 */}
        <div className="p-4 border border-border rounded-xl bg-card">
          <h2 className="text-base font-bold text-foreground mb-3">2. CSV 지원자 데이터 텍스트 입력</h2>
          <textarea
            className="w-full h-40 p-3 border border-input rounded-lg text-xs font-mono bg-background mb-4"
            placeholder="구글 폼 결과 CSV 전체 내용을 복사하여 붙여넣으세요..."
            value={csvText}
            onChange={(e) => handleCsvInput(e.target.value)}
          />

          {headers.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">열↔필드 매핑</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.keys(fieldLabels).map((fieldKey) => (
                  <div key={fieldKey} className="flex items-center justify-between text-xs border p-2 rounded">
                    <span className="font-medium text-foreground">{fieldLabels[fieldKey]}</span>
                    <select
                      value={mapping[fieldKey] || ''}
                      onChange={(e) => setMapping({ ...mapping, [fieldKey]: e.target.value })}
                      className="p-1 border border-input rounded bg-background text-xs max-w-[140px]"
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

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handlePreview}
                  className="px-4 py-2 text-xs font-bold bg-secondary text-secondary-foreground rounded-lg hover:opacity-90"
                >
                  미리보기 & 중복 검사
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. 미리보기 결과 */}
        {previewResult && (
          <div className="p-4 border border-border rounded-xl bg-card">
            <h2 className="text-base font-bold text-foreground mb-2">3. 검증 결과 미리보기</h2>
            <div className="text-xs space-y-1 mb-4 text-muted-foreground">
              <p>파싱된 총 지원자: <strong>{previewResult.totalParsed}명</strong></p>
              <p>중복 감지 (건너뜀): <strong>{previewResult.duplicateCount}명</strong></p>
              <p>신규 등록 예정: <strong className="text-primary">{previewResult.uniqueCount}명</strong></p>
            </div>

            <h3 className="text-xs font-bold text-foreground mb-2">샘플 미리보기 (상위 5건)</h3>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-2">이름</th>
                    <th className="p-2">전화번호</th>
                    <th className="p-2">학교/학과</th>
                    <th className="p-2">가장 가까운 역 (주소)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResult.sample?.map((s: any, idx: number) => {
                    const hasAddressPattern = s.nearStation && /[시구동번지]/.test(s.nearStation);
                    return (
                      <tr key={idx} className="border-t">
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2">{s.phone}</td>
                        <td className="p-2">{s.school} {s.department}</td>
                        <td className="p-2">
                          {s.nearStation}
                          {hasAddressPattern && (
                            <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px]">
                              ⚠️ 역명만 남기도록 확인 필요
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={loading || previewResult.uniqueCount === 0}
                onClick={handleConfirmUpload}
                className="px-5 py-2.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {loading ? '업로드 중...' : `최종 ${previewResult.uniqueCount}명 업로드 확정`}
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className="p-4 bg-muted border border-border rounded-xl text-sm font-medium text-foreground">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
