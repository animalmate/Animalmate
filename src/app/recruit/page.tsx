'use client';

import React, { useState } from 'react';

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
        setErrorMsg(`시도 횟수가 초과되었습니다. ${data.retryAfter || 60}초 후 다시 시도해주세요.`);
      } else {
        setErrorMsg('입력 정보를 확인해주세요.');
      }
    } catch {
      setErrorMsg('입력 정보를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col items-center justify-center p-4">
      {/* noindex 헤더용 메타 */}
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <title>신입 부원 모집 결과 조회 - 애니멀메이트</title>
      </head>

      <div className="max-w-md w-full border border-border rounded-2xl bg-card p-8 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.png" alt="애니멀메이트" className="w-12 h-12 mx-auto rounded-full" />
          <h1 className="text-xl font-bold text-foreground">신입 부원 모집 결과 조회</h1>
          <p className="text-xs text-muted-foreground">
            지원 시 입력하신 이름과 전화번호를 입력하세요.
          </p>
        </div>

        <form onSubmit={handleLookup} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">성명</label>
            <input
              type="text"
              required
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 border border-input rounded-xl text-sm bg-background"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">전화번호</label>
            <input
              type="text"
              required
              placeholder="01012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-2.5 border border-input rounded-xl text-sm bg-background"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? '조회 중...' : '결과 조회하기'}
          </button>
        </form>

        {errorMsg && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive text-center font-medium">
            {errorMsg}
          </div>
        )}

        {result && (
          <div className="p-5 border border-border rounded-xl bg-muted/30 space-y-4 text-xs">
            <div className="text-center space-y-1">
              <span className="text-muted-foreground">지원 상태</span>
              <div className="text-lg font-bold text-primary">{result.status}</div>
            </div>

            {/* 면접 일정 공개 시 */}
            {result.schedulePublic && result.interviewSlot && (
              <div className="p-3 bg-card border rounded-lg space-y-1">
                <div className="font-bold text-foreground">📅 면접 일정</div>
                <div className="text-muted-foreground">
                  일시: {new Date(result.interviewSlot.startsAt).toLocaleString('ko-KR')} ({result.interviewSlot.durationMin}분)
                </div>
                {result.interviewLink && (
                  <div className="pt-1">
                    <a
                      href={result.interviewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline font-medium"
                    >
                      면접 접속 링크 열기 🔗
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* 최종 결과 공개 시 */}
            {result.resultPublic && (
              <div className="p-3 bg-card border rounded-lg text-center space-y-1">
                <div className="font-bold text-foreground">🏆 최종 모집 결과</div>
                <div className={`text-base font-bold ${result.status === 'final_pass' ? 'text-green-600' : 'text-red-600'}`}>
                  {result.status === 'final_pass' ? '🎉 최종 합격을 축하합니다!' : '아쉽게도 이번 기수에는 모시지 못하게 되었습니다.'}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-border text-[11px] text-muted-foreground text-center leading-relaxed">
          지원 정보는 선발 목적으로만 이용하며, 모집 절차가 끝나는 즉시 모두 안전하게 영구 폐기됩니다.
        </div>
      </div>
    </div>
  );
}
