'use client';
// 팀 가이드북 화면.
//
// 부원에게는 팀별 카드 + `가이드북 보기` 뿐이다. 팀장단·회장단에게만 올리기/검수/삭제가 붙는다.
//
// 업로드는 **브라우저 → Supabase Storage 직접 전송**이다(서버는 서명 URL 만 내준다).
// Vercel 함수 본문 상한 4.5MB 때문에 파일이 우리 서버를 지나갈 수 없다 —
// 그래서 여기 fetch 가 우리 도메인이 아닌 곳으로 나간다(CSP connect-src 에 열어 두었다).
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, DangerButton, ErrorText, InfoText, SecondaryButton, Textarea } from '@/components/ui';
import { Modal } from '@/components/modal';
import { HelpButton } from '@/components/help-button';
import { Toast } from '@/components/toast';
import { Icon } from '@/components/icon';

interface GuidebookInfo {
  fileName: string;
  fileBytes: number;
  status: 'extracted' | 'ready' | 'failed';
  inChatbot: boolean;
  pendingText: string | null;
  failReason: string | null;
  uploadedByName: string | null;
  updatedAt: string;
  viewUrl: string;
}
interface TeamRow {
  teamId: string;
  teamName: string;
  guidebook: GuidebookInfo | null;
  canManage: boolean;
}

const MAX_BYTES = 20 * 1024 * 1024;

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { dateStyle: 'medium' });
}

export function GuidebooksPanel() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [viewing, setViewing] = useState<TeamRow | null>(null);
  const [review, setReview] = useState<{ team: TeamRow; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{ teams: TeamRow[] }>('/api/guidebooks');
    if (res.ok) {
      setRows(res.data.teams ?? []);
      setError('');
    } else {
      setError(errorMessage(res.data.error, '가이드북을 불러오지 못했습니다.'));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-[22px] font-bold text-ink-900">팀 가이드북</h1>
          {/* 도움말은 **올릴 수 있는 사람에게만** 보여 준다 — 내용이 올리는 사람에게 하는 말이다. */}
          {rows.some((r) => r.canManage) ? <HelpButton screen="guidebooks" /> : null}
        </div>
        <InfoText>
          팀마다 활동 안내를 모아 둔 자료입니다. 눌러서 바로 볼 수 있고, 봉사 운영 정보는 챗봇도 답합니다.
        </InfoText>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading ? <InfoText>불러오는 중…</InfoText> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <TeamCard
            key={row.teamId}
            row={row}
            onView={() => setViewing(row)}
            onReview={(text) => setReview({ team: row, text })}
            onChanged={(msg) => {
              setToast(msg);
              void load();
            }}
            onError={setError}
          />
        ))}
      </div>

      {!loading && rows.length === 0 ? <InfoText>활동팀이 없습니다.</InfoText> : null}

      {viewing?.guidebook ? (
        <Modal title={`${viewing.teamName} 가이드북`} onClose={() => setViewing(null)} size="xl">
          <PdfView url={viewing.guidebook.viewUrl} />
        </Modal>
      ) : null}

      {review ? (
        <ReviewModal
          teamName={review.team.teamName}
          teamId={review.team.teamId}
          initialText={review.text}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            setToast('챗봇에 반영했습니다.');
            void load();
          }}
        />
      ) : null}

      <Toast text={toast} onDone={() => setToast('')} />
    </div>
  );
}

/** 팀 한 칸. 가이드북이 없는 팀도 그린다 — 부원에게 "아직 없다"를 보여 주고 팀장단에게 올릴 자리를 준다. */
function TeamCard({
  row,
  onView,
  onReview,
  onChanged,
  onError,
}: {
  row: TeamRow;
  onView: () => void;
  onReview: (text: string) => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const gb = row.guidebook;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink-900">{row.teamName}</div>
          {gb ? (
            <div className="truncate text-[12px] text-ink-500">
              {gb.fileName} · {sizeLabel(gb.fileBytes)} · {dateLabel(gb.updatedAt)}
            </div>
          ) : (
            <div className="text-[12px] text-ink-500">아직 올라온 가이드북이 없어요</div>
          )}
        </div>
        {gb ? <ChatbotBadge gb={gb} /> : null}
      </div>

      {gb ? (
        <SecondaryButton onClick={onView} className="w-full">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="doc" className="h-4 w-4" />
            가이드북 보기
          </span>
        </SecondaryButton>
      ) : null}

      {row.canManage ? (
        <ManageRow row={row} onReview={onReview} onChanged={onChanged} onError={onError} />
      ) : null}
    </Card>
  );
}

/**
 * 챗봇이 이 가이드북을 읽고 있는지. **부원에게도 보인다** — "챗봇이 답 못 하는 이유"가 여기 있다.
 * 상태 이름을 그대로 쓰지 않고 사람이 읽는 말로 바꾼다(`extracted` 는 화면에서 아무 뜻이 없다).
 */
function ChatbotBadge({ gb }: { gb: GuidebookInfo }) {
  if (gb.inChatbot) {
    return <span className="shrink-0 rounded-full bg-success-100 px-2 py-0.5 text-[11px] text-success">챗봇 반영됨</span>;
  }
  if (gb.status === 'extracted') {
    return <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-600">확인 대기</span>;
  }
  return <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-500">챗봇 미반영</span>;
}

/** 팀장단·회장단에게만 보이는 줄 — 올리기 / 검수 / 삭제. */
function ManageRow({
  row,
  onReview,
  onChanged,
  onError,
}: {
  row: TeamRow;
  onReview: (text: string) => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const gb = row.guidebook;

  async function upload(file: File) {
    if (file.type !== 'application/pdf') {
      onError('PDF 파일만 올릴 수 있습니다. 파워포인트는 PDF 로 저장해 주세요.');
      return;
    }
    if (file.size > MAX_BYTES) {
      onError(`파일이 너무 큽니다(최대 ${MAX_BYTES / 1024 / 1024}MB).`);
      return;
    }
    onError('');
    try {
      // 1) 서명 URL 발급 — 이 경로에만 쓸 수 있는 일회성 주소.
      setBusy('올리는 중…');
      const ticket = await apiPost<{ uploadUrl: string; path: string }>('/api/guidebooks/upload-url', {
        teamId: row.teamId,
        contentType: file.type,
        fileBytes: file.size,
      });
      if (!ticket.ok) {
        onError(ticket.data.message ?? errorMessage(ticket.data.error, '업로드를 시작하지 못했습니다.'));
        return;
      }

      // 2) 브라우저 → Storage 직접 전송(우리 서버를 지나지 않는다).
      const put = await fetch(ticket.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      if (!put.ok) {
        onError('파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      // 3) 등록 + 텍스트 추출. PDF 를 읽는 동안이라 조금 걸린다.
      setBusy('가이드북을 읽는 중…');
      const reg = await apiPost<{ status: string; pendingText: string | null; failReason: string | null }>(
        '/api/guidebooks',
        { teamId: row.teamId, path: ticket.data.path, fileName: file.name }
      );
      if (!reg.ok) {
        onError(reg.data.message ?? errorMessage(reg.data.error, '가이드북을 등록하지 못했습니다.'));
        return;
      }
      // 추출이 됐으면 곧바로 검수 상자를 연다 — 여기서 확인해야 챗봇이 읽는다.
      if (reg.data.pendingText) {
        onChanged('가이드북을 올렸습니다.');
        onReview(reg.data.pendingText);
      } else {
        onChanged('가이드북을 올렸습니다. 봉사 운영 정보는 찾지 못했어요.');
      }
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = ''; // 같은 파일을 다시 골라도 change 가 뜨도록
    }
  }

  async function remove() {
    setBusy('지우는 중…');
    const res = await fetch(`/api/guidebooks?teamId=${encodeURIComponent(row.teamId)}`, { method: 'DELETE' });
    setBusy('');
    setConfirmDelete(false);
    if (res.ok) onChanged('가이드북을 지웠습니다.');
    else onError('가이드북을 지우지 못했습니다.');
  }

  return (
    <div className="space-y-2 border-t border-ink-100 pt-3">
      {gb?.failReason ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          {gb.failReason} 아래 <b>내용 확인</b>에서 직접 적어 넣으면 챗봇이 답할 수 있어요.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <SecondaryButton disabled={busy !== ''} onClick={() => fileRef.current?.click()}>
          {busy || (gb ? '새 파일로 바꾸기' : 'PDF 올리기')}
        </SecondaryButton>

        {gb ? (
          <>
            <SecondaryButton disabled={busy !== ''} onClick={() => onReview(gb.pendingText ?? '')}>
              내용 확인
            </SecondaryButton>
            <DangerButton disabled={busy !== ''} onClick={() => setConfirmDelete(true)}>
              삭제
            </DangerButton>
          </>
        ) : null}
      </div>

      {!gb ? <div className="text-[12px] text-ink-500">파워포인트는 PDF 로 저장해서 올려 주세요.</div> : null}

      {confirmDelete ? (
        <Modal title="가이드북을 지울까요?" onClose={() => setConfirmDelete(false)}>
          <p className="text-[14px] text-ink-700">
            파일과 챗봇이 읽던 내용이 함께 지워집니다. 되돌릴 수 없습니다.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <SecondaryButton onClick={() => setConfirmDelete(false)}>취소</SecondaryButton>
            <DangerButton onClick={() => void remove()}>지우기</DangerButton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/**
 * 검수 상자 — **여기서 저장해야 챗봇이 읽는다.**
 *
 * 보여 주는 것은 가이드북 전문이 아니라 **봉사 운영 정보 요약**이다(추출 단계에서 그것만 뽑는다).
 * 짧아야 사람이 실제로 읽고 틀린 곳을 잡는다 — 전문을 띄우면 아무도 안 읽고 확인 절차가 형식만 남는다.
 */
function ReviewModal({
  teamName,
  teamId,
  initialText,
  onClose,
  onSaved,
}: {
  teamName: string;
  teamId: string;
  initialText: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState('');
  const [pii, setPii] = useState<{ label: string }[] | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(piiAck: boolean) {
    setSaving(true);
    setError('');
    const res = await apiPost<{ status: string; findings?: { label: string }[]; message?: string }>(
      '/api/guidebooks',
      { teamId, contentMd: text, piiAck },
      'PUT'
    );
    setSaving(false);
    if (res.ok) {
      onSaved();
      return;
    }
    if (res.status === 422 && res.data.findings) {
      setPii(res.data.findings);
      return;
    }
    setError(res.data.message ?? errorMessage(res.data.error, '저장하지 못했습니다.'));
  }

  return (
    <Modal title={`${teamName} — 챗봇이 읽을 내용`} onClose={onClose} size="lg">
      <div className="space-y-3">
        <InfoText>
          가이드북에서 <b>봉사 운영 정보만</b> 뽑아낸 것입니다. 틀린 곳이 있으면 고쳐 주세요.
          저장해야 챗봇이 읽습니다. 비어 있으면 직접 적어 넣어도 됩니다.
        </InfoText>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder={'## 봉사 주기\n- 매주 토요일\n\n## 신청 방법\n- 단톡방 공지를 보고 카페 댓글로 신청'}
        />

        <div className="text-[12px] text-ink-500">
          이름·전화번호 같은 개인정보는 넣지 마세요. 나머지 가이드북 내용은 부원이 파일을 직접 봅니다.
        </div>

        {error ? <ErrorText>{error}</ErrorText> : null}

        {pii ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
            개인정보로 보이는 것이 있습니다: {pii.map((f) => f.label).join(', ')}.
            <br />
            지우고 저장하는 것을 권합니다. 그대로 두면 챗봇이 읽는 자료에 들어갑니다.
            <div className="mt-2">
              <SecondaryButton disabled={saving} onClick={() => void save(true)}>
                확인했습니다, 그대로 저장
              </SecondaryButton>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
          <Button disabled={saving || text.trim().length < 20} onClick={() => void save(false)}>
            {saving ? '저장 중…' : '챗봇에 반영'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * PDF 미리보기.
 *
 * 모바일 브라우저(특히 안드로이드 크롬)는 iframe 안의 PDF 를 그리지 않고 빈 칸으로 둔다.
 * 그래서 **새 탭으로 여는 버튼을 항상 함께** 둔다 — 안 되는 화면에서 빠져나갈 길이 없으면 안 된다.
 */
function PdfView({ url }: { url: string }) {
  return (
    <div className="space-y-3">
      <iframe src={url} title="가이드북" className="h-[70vh] w-full rounded-lg border border-ink-200" />
      <div className="flex justify-end">
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-brand-600 underline">
          화면에 안 보이면 새 탭에서 열기
        </a>
      </div>
    </div>
  );
}
