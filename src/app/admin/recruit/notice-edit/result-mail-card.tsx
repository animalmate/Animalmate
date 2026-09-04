'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, SecondaryButton, StatusMessage } from '@/components/ui';
import { RESULT_MAIL_STAGES, STAGE_DESC, STAGE_LABEL, type ResultMailStage } from '@/recruit/result-mail-rules';

interface Preview {
  stage: ResultMailStage;
  eligible: number;
  alreadyQueued: number;
  toQueue: number;
  noEmail: number;
  switchOn: boolean;
  requiredSwitch: 'schedulePublic' | 'resultPublic';
}

interface StatusRow {
  stage: ResultMailStage;
  queued: number;
  sent: number;
  failed: number;
}

const SWITCH_NAME: Record<Preview['requiredSwitch'], string> = {
  schedulePublic: '면접 일정/링크 지원자 공개',
  resultPublic: '최종 합격 결과 지원자 공개',
};

/**
 * 결과 안내 메일 발송 카드.
 *
 * **왜 스위치에 자동으로 붙이지 않는가**(결정 148): 스위치는 껐다 켤 수 있는 값인데 메일은
 * 되돌릴 수 없다. 그래서 사람이 한 번 더 누르게 하고, 누르기 전에 **몇 명에게 나가는지** 보여 준다.
 * 메일 본문에는 당락을 쓰지 않는다 — "결과가 나왔으니 확인해 주세요" 까지다.
 *
 * `switchesOn` 을 부모에게서 받는 이유: 스위치를 켜자마자 이 카드가 따라 바뀌어야 하는데,
 * 서버에서 다시 읽어 오면 한 박자 늦어 "켰는데 아직 잠겨 있다" 로 보인다.
 */
export function ResultMailCard({
  cohortId,
  schedulePublic,
  resultPublic,
}: {
  cohortId: string;
  schedulePublic: boolean;
  resultPublic: boolean;
}) {
  const [status, setStatus] = useState<StatusRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!cohortId) return;
    const res = await fetch(`/api/recruit/result-mails?cohortId=${cohortId}`);
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.status)) setStatus(data.status);
  }, [cohortId]);

  useEffect(() => {
    setPreview(null);
    setMessage('');
    void refresh();
  }, [refresh]);

  const switchOnFor = (stage: ResultMailStage) => (stage === 'final' ? resultPublic : schedulePublic);

  const loadPreview = async (stage: ResultMailStage) => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`/api/recruit/result-mails?cohortId=${cohortId}&stage=${stage}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.preview) setPreview(data.preview);
      else setMessage(`❌ 오류: ${data.message || data.error}`);
    } finally {
      setBusy(false);
    }
  };

  const confirmSend = async () => {
    if (!preview) return;
    if (
      !confirm(
        `${STAGE_LABEL[preview.stage]} 메일을 ${preview.toQueue}명에게 보냅니다.\n` +
          '보낸 메일은 되돌릴 수 없습니다. 계속할까요?'
      )
    )
      return;

    setBusy(true);
    try {
      const res = await fetch('/api/recruit/result-mails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, stage: preview.stage }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(
          `✅ ${data.queued}명을 발송 대기열에 담았습니다. 잠시 뒤부터 순서대로 나갑니다` +
            (data.skipped > 0 ? ` (이미 보낸 ${data.skipped}명 제외).` : '.')
        );
        setPreview(null);
        await refresh();
      } else {
        setMessage(`❌ ${data.message || data.error}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const rowOf = (stage: ResultMailStage) =>
    status.find((s) => s.stage === stage) ?? { stage, queued: 0, sent: 0, failed: 0 };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-ink-900">결과 안내 메일</h2>
        <p className="mt-1 text-xs text-ink-500">
          지원서에 적힌 이메일로 <strong>&ldquo;결과가 나왔으니 홈페이지에서 확인해 주세요&rdquo;</strong> 안내를
          보냅니다. <strong>메일에 당락은 쓰지 않습니다</strong> — 결과는 조회 화면에서만 보여 줍니다.
        </p>
      </div>

      <div className="space-y-2">
        {RESULT_MAIL_STAGES.map((stage) => {
          const row = rowOf(stage);
          const locked = !switchOnFor(stage);
          return (
            <div
              key={stage}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cream-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-ink-900">{STAGE_LABEL[stage]}</p>
                {/* 누구에게 가는 안내인지 한 줄. 없으면 셋을 다 눌러야 하는 것으로 보인다 —
                    실제로 서류·면접이 두 통으로 갈려 있던 동안 같은 사람이 두 번 받았다. */}
                <p className="text-[11px] text-ink-500">{STAGE_DESC[stage]}</p>
                <p className="text-[11px] text-ink-500">
                  보냄 {row.sent} · 대기 {row.queued}
                  {row.failed > 0 && <span className="ml-1 font-semibold text-coral-600">· 실패 {row.failed}</span>}
                </p>
              </div>
              {locked ? (
                <span className="text-[11px] font-semibold text-ink-400">
                  {SWITCH_NAME[stage === 'final' ? 'resultPublic' : 'schedulePublic']}를 먼저 켜세요
                </span>
              ) : (
                <SecondaryButton type="button" disabled={busy || !cohortId} onClick={() => void loadPreview(stage)}>
                  보낼 대상 확인
                </SecondaryButton>
              )}
            </div>
          );
        })}
      </div>

      {/* 미리보기 — 누르기 전에 몇 명에게 나가는지 본다. */}
      {preview && (
        <div className="space-y-2 rounded-xl border-[1.5px] border-blue-200 bg-blue-50 p-4">
          <p className="text-[13px] font-bold text-ink-900">{STAGE_LABEL[preview.stage]} — 보낼 대상</p>
          <ul className="space-y-0.5 text-[13px] text-ink-700">
            <li>
              새로 보낼 사람 <strong className="text-blue-700">{preview.toQueue}명</strong>
            </li>
            {preview.alreadyQueued > 0 && <li className="text-ink-500">이미 보냈거나 대기 중 {preview.alreadyQueued}명 (제외)</li>}
            {preview.noEmail > 0 && (
              <li className="font-semibold text-coral-600">
                이메일이 없어 못 보내는 사람 {preview.noEmail}명 — 따로 연락해 주세요
              </li>
            )}
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" disabled={busy || preview.toQueue === 0} onClick={() => void confirmSend()}>
              {busy ? '보내는 중…' : `${preview.toQueue}명에게 보내기`}
            </Button>
            <SecondaryButton type="button" onClick={() => setPreview(null)}>
              취소
            </SecondaryButton>
          </div>
        </div>
      )}

      {message && <StatusMessage text={message} />}

      <p className="text-[11px] text-ink-500">
        한 번에 다 나가지 않고 <strong>몇 분에 걸쳐 조금씩</strong> 나갑니다(메일 서버가 도배로 보지 않게).
        하루 한도를 넘기면 남은 것은 <strong>다음 날 이어서</strong> 나가니 그대로 두시면 됩니다.
        같은 사람에게 같은 안내가 두 번 가지는 않습니다.
      </p>
    </Card>
  );
}
