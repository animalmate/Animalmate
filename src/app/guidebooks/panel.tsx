'use client';
// 가이드북 화면 — 맨 위 **전체 부원 가이드북** 한 칸(회장단만 올린다) + 팀별 칸.
//
// 부원에게는 카드 + `가이드북 보기` 뿐이다. 팀장단·회장단에게만 올리기/검수/삭제가 붙는다.
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

/**
 * 올리고 고치는 사람에게만 실리는 값들. **부원 응답에는 통째로 없다**(서버가 안 보낸다) —
 * 부원이 이 화면에서 할 일은 여는 것 하나라, 파일 이름·용량·날짜·챗봇 상태는 읽을 것만 늘린다.
 */
interface GuidebookAdmin {
  fileName: string;
  fileBytes: number;
  status: 'extracting' | 'extracted' | 'ready' | 'failed';
  inChatbot: boolean;
  /** 확인 전 본문. 확인을 마치면 null 이 된다. */
  pendingText: string | null;
  /** 챗봇이 지금 읽고 있는 본문. 확인을 마친 뒤 `내용 확인` 이 여는 것이 이것이다. */
  confirmedText: string | null;
  failReason: string | null;
  uploadedByName: string | null;
  updatedAt: string;
}
interface GuidebookInfo {
  /** null = 스토리지에 파일이 없다(행만 남은 상태). 보기 버튼 대신 다시 올려 달라고 말한다. */
  viewUrl: string | null;
  admin: GuidebookAdmin | null;
}
interface TeamRow {
  teamId: string;
  teamName: string;
  guidebook: GuidebookInfo | null;
  canManage: boolean;
}
/** 동아리 전체 가이드북 한 건. 챗봇이 읽지 않으므로 상태·검수 칸이 없다.
 *  이름 칸도 없다 — 칸이 하나뿐이라 늘 `전체 부원 가이드북` 이다. */
interface ClubRow {
  /** null = 스토리지에 파일이 없다(행만 남은 상태). */
  viewUrl: string | null;
  admin: { fileName: string; fileBytes: number; uploadedByName: string | null; updatedAt: string } | null;
}

/**
 * 상한 50MB. 서버(`src/storage/guidebooks.ts`)와 같은 값이어야 한다 — 여기서 먼저 막는 것은
 * 사용자의 시간을 아끼기 위해서이고, 진짜 검문은 서버가 업로드된 파일을 보고 다시 한다.
 */
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * 상한을 넘겼을 때 하는 말. 서버(`src/guidebooks/guidebooks.ts`)와 **같은 문장**이어야 한다 —
 * 브라우저에서 걸리든 서버에서 걸리든 사용자가 볼 화면은 하나다.
 * 무엇이 잘못됐는지가 아니라 **다음에 할 일**을 먼저 말한다.
 */
const TOO_BIG = `파일이 너무 큽니다. pdf를 압축 후 올려주세요. (최대 ${MAX_BYTES / 1024 / 1024}MB)`;

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { dateStyle: 'medium' });
}

/** 고를 때 바로 걸러 낼 것. 통과했다고 안전한 것은 아니다(서버가 다시 본다). */
function rejectReason(file: File): string | null {
  if (file.type !== 'application/pdf') return 'PDF 파일만 올릴 수 있습니다. 파워포인트는 PDF 로 저장해 주세요.';
  if (file.size > MAX_BYTES) return TOO_BIG;
  return null;
}

/**
 * ① 서명 URL 발급 → ② 브라우저에서 Storage 로 직접 전송. **등록(③)은 부르는 쪽이 한다** —
 * 팀 것과 전체 것은 등록 주소도, 등록한 뒤 할 일도 다르기 때문이다(팀은 검수 상자가 열린다).
 */
async function putToStorage(
  file: File,
  target: { scope: 'club' } | { teamId: string }
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const ticket = await apiPost<{ uploadUrl: string; path: string }>('/api/guidebooks/upload-url', {
    ...target,
    contentType: file.type,
    fileBytes: file.size,
  });
  if (!ticket.ok) {
    return { ok: false, message: ticket.data.message ?? errorMessage(ticket.data.error, '업로드를 시작하지 못했습니다.') };
  }

  const put = await fetch(ticket.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
  if (!put.ok) return { ok: false, message: '파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.' };

  return { ok: true, path: ticket.data.path };
}

export function GuidebooksPanel() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [club, setClub] = useState<ClubRow | null>(null);
  const [canManageClub, setCanManageClub] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [viewing, setViewing] = useState<{ title: string; url: string } | null>(null);
  const [review, setReview] = useState<{ team: TeamRow; text: string; reflected: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{ teams: TeamRow[]; club: ClubRow | null; canManageClub: boolean }>('/api/guidebooks');
    if (res.ok) {
      setRows(res.data.teams ?? []);
      setClub(res.data.club ?? null);
      setCanManageClub(res.data.canManageClub === true);
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
          <h1 className="text-[22px] font-bold text-ink-900">가이드북</h1>
          {/* 도움말은 **올릴 수 있는 사람에게만** 보여 준다 — 내용이 올리는 사람에게 하는 말이다. */}
          {canManageClub || rows.some((r) => r.canManage) ? <HelpButton screen="guidebooks" /> : null}
        </div>
        <InfoText>
          동아리 전체 가이드북과 팀별 활동 안내입니다. 눌러서 바로 볼 수 있고, 팀 가이드북의 봉사 운영 정보는 챗봇도 답합니다.
        </InfoText>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading ? <InfoText>불러오는 중…</InfoText> : null}

      {/* 전체 가이드북이 먼저다 — 동아리 전체가 따르는 한 권이고, 팀 것은 그 아래 갈래다.
          아직 없고 올릴 수도 없는 사람(부원)에게는 빈 칸을 그리지 않는다. */}
      {!loading && (club || canManageClub) ? (
        <ClubCard
          club={club}
          canManage={canManageClub}
          onView={() => club?.viewUrl && setViewing({ title: CLUB_TITLE, url: club.viewUrl })}
          onChanged={(msg) => {
            setToast(msg);
            void load();
          }}
          onError={setError}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <TeamCard
            key={row.teamId}
            row={row}
            onView={() =>
              row.guidebook?.viewUrl &&
              setViewing({ title: `${row.teamName} 가이드북`, url: row.guidebook.viewUrl })
            }
            onReview={(text, reflected) => setReview({ team: row, text, reflected })}
            onChanged={(msg) => {
              setToast(msg);
              void load();
            }}
            onError={setError}
          />
        ))}
      </div>

      {!loading && rows.length === 0 ? <InfoText>활동팀이 없습니다.</InfoText> : null}

      {viewing ? (
        <Modal title={viewing.title} onClose={() => setViewing(null)} size="xl">
          <PdfView url={viewing.url} />
        </Modal>
      ) : null}

      {review ? (
        <ReviewModal
          teamName={review.team.teamName}
          teamId={review.team.teamId}
          initialText={review.text}
          reflected={review.reflected}
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

/** 화면에 보이는 이름. 고정값이다 — 서비스의 CLUB_GUIDEBOOK_TITLE 과 같은 말이어야 한다. */
const CLUB_TITLE = '전체 부원 가이드북';

/**
 * 행은 남아 있는데 스토리지의 파일이 없을 때. 화면 전체를 죽이는 대신 이 줄을 보여 준다
 * (2026-09-03: 파일이 사라진 행 하나 때문에 `/guidebooks` 가 통째로 500 이었다).
 */
function MissingFile() {
  return (
    <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
      파일을 찾을 수 없어요. 다시 올려 주세요.
    </div>
  );
}

/**
 * 동아리 전체 가이드북 한 칸. 팀 칸과 다른 점 셋:
 *   - 이름이 고정이다. 칸이 하나뿐이라 구분할 것이 없다(기수를 넣으면 사람이 매번 고쳐야 한다).
 *   - 챗봇 딱지도 검수 상자도 없다 — 이 파일은 챗봇이 읽지 않는다.
 *   - 가로로 넓게 둔다. 팀 카드 격자에 섞이면 "여러 팀 중 하나"로 보인다.
 */
function ClubCard({
  club,
  canManage,
  onView,
  onChanged,
  onError,
}: {
  club: ClubRow | null;
  canManage: boolean;
  onView: () => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function upload(file: File) {
    const bad = rejectReason(file);
    if (bad) {
      onError(bad);
      return;
    }
    onError('');
    try {
      setBusy('올리는 중…');
      const put = await putToStorage(file, { scope: 'club' });
      if (!put.ok) {
        onError(put.message);
        return;
      }
      const reg = await apiPost('/api/guidebooks/club', { path: put.path, fileName: file.name });
      if (!reg.ok) {
        onError(reg.data.message ?? errorMessage(reg.data.error, `${CLUB_TITLE}을 등록하지 못했습니다.`));
        return;
      }
      onChanged(`${CLUB_TITLE}을 올렸습니다.`);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = ''; // 같은 파일을 다시 골라도 change 가 뜨도록
    }
  }

  async function remove() {
    setBusy('지우는 중…');
    const res = await fetch('/api/guidebooks/club', { method: 'DELETE' });
    setBusy('');
    setConfirmDelete(false);
    if (res.ok) onChanged(`${CLUB_TITLE}을 지웠습니다.`);
    else onError(`${CLUB_TITLE}을 지우지 못했습니다.`);
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon name="doc" className="h-4 w-4 shrink-0 text-ink-500" />
          <div className="truncate text-[15px] font-bold text-ink-900">{CLUB_TITLE}</div>
        </div>
        {/* 파일 이름·용량·날짜는 **올릴 수 있는 사람에게만** 온다(부원 응답에는 admin 이 없다). */}
        {club?.admin ? (
          <div className="truncate pl-6 text-[12px] text-ink-500">
            {club.admin.fileName} · {sizeLabel(club.admin.fileBytes)} · {dateLabel(club.admin.updatedAt)}
          </div>
        ) : null}
        {!club && canManage ? (
          <div className="pl-6 text-[12px] text-ink-500">동아리 전체가 함께 보는 가이드북을 올리는 자리입니다</div>
        ) : null}
      </div>

      {club?.viewUrl ? (
        <SecondaryButton onClick={onView} className="w-full">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="doc" className="h-4 w-4" />
            가이드북 보기
          </span>
        </SecondaryButton>
      ) : null}
      {club && !club.viewUrl ? <MissingFile /> : null}

      {canManage ? (
        <div className="space-y-2 border-t border-ink-100 pt-3">
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
              {busy || (club ? '새 파일로 바꾸기' : 'PDF 올리기')}
            </SecondaryButton>
            {club ? (
              <DangerButton disabled={busy !== ''} onClick={() => setConfirmDelete(true)}>
                삭제
              </DangerButton>
            ) : null}
          </div>
          {!club ? (
            <div className="text-[12px] text-ink-500">파워포인트는 PDF 로 저장해서 올려 주세요.</div>
          ) : null}
        </div>
      ) : null}

      {confirmDelete ? (
        <Modal title={`${CLUB_TITLE}을 지울까요?`} onClose={() => setConfirmDelete(false)}>
          <p className="text-[14px] text-ink-700">파일이 지워집니다. 되돌릴 수 없습니다.</p>
          <div className="mt-4 flex justify-end gap-2">
            <SecondaryButton onClick={() => setConfirmDelete(false)}>취소</SecondaryButton>
            <DangerButton onClick={() => void remove()}>지우기</DangerButton>
          </div>
        </Modal>
      ) : null}
    </Card>
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
  /** `reflected` = 이미 챗봇에 반영된 본문을 여는 것인가(상자 안내 문구가 갈린다). */
  onReview: (text: string, reflected: boolean) => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const gb = row.guidebook;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink-900">{row.teamName}</div>
          {/* 파일 이름·용량·날짜와 챗봇 딱지는 **올릴 수 있는 사람에게만** 온다. 부원에게는
              "없어요"만 남는다 — 있으면 열면 되고, 없으면 팀장단에게 요청하면 되기 때문이다. */}
          {gb?.admin ? (
            <div className="truncate text-[12px] text-ink-500">
              {gb.admin.fileName} · {sizeLabel(gb.admin.fileBytes)} · {dateLabel(gb.admin.updatedAt)}
            </div>
          ) : null}
          {!gb ? <div className="text-[12px] text-ink-500">아직 올라온 가이드북이 없어요</div> : null}
        </div>
        {gb?.admin ? <ChatbotBadge gb={gb.admin} /> : null}
      </div>

      {gb?.viewUrl ? (
        <SecondaryButton onClick={onView} className="w-full">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="doc" className="h-4 w-4" />
            가이드북 보기
          </span>
        </SecondaryButton>
      ) : null}
      {gb && !gb.viewUrl ? <MissingFile /> : null}

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
function ChatbotBadge({ gb }: { gb: GuidebookAdmin }) {
  if (gb.inChatbot) {
    return <span className="shrink-0 rounded-full bg-success-100 px-2 py-0.5 text-[11px] text-success">챗봇 반영됨</span>;
  }
  if (gb.status === 'extracted') {
    return <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-600">확인 대기</span>;
  }
  // 파일은 올라왔고 읽는 중. 여기서 멈춘 채로 남아 있으면 읽다가 끊긴 것이다 —
  // 다시 올리거나 `내용 확인`에 직접 적어 넣으면 된다(파일 보기는 이미 된다).
  if (gb.status === 'extracting') {
    return <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-500">읽는 중</span>;
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
  /** `reflected` = 이미 챗봇에 반영된 본문을 여는 것인가(상자 안내 문구가 갈린다). */
  onReview: (text: string, reflected: boolean) => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const gb = row.guidebook;

  async function upload(file: File) {
    const bad = rejectReason(file);
    if (bad) {
      onError(bad);
      return;
    }
    onError('');
    try {
      // 1~2) 서명 URL 발급 → 브라우저에서 Storage 로 직접 전송(우리 서버를 지나지 않는다).
      setBusy('올리는 중…');
      const put = await putToStorage(file, { teamId: row.teamId });
      if (!put.ok) {
        onError(put.message);
        return;
      }

      // 3) 등록 + 텍스트 추출. PDF 를 읽는 동안이라 조금 걸린다.
      setBusy('가이드북을 읽는 중…');
      const reg = await apiPost<{ status: string; pendingText: string | null; failReason: string | null }>(
        '/api/guidebooks',
        { teamId: row.teamId, path: put.path, fileName: file.name }
      );
      if (!reg.ok) {
        onError(reg.data.message ?? errorMessage(reg.data.error, '가이드북을 등록하지 못했습니다.'));
        return;
      }
      // 추출이 됐으면 곧바로 검수 상자를 연다 — 여기서 확인해야 챗봇이 읽는다.
      if (reg.data.pendingText) {
        onChanged('가이드북을 올렸습니다.');
        onReview(reg.data.pendingText, false);
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
      {gb?.admin?.failReason ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          {gb.admin.failReason} 아래 <b>내용 확인</b>에서 직접 적어 넣으면 챗봇이 답할 수 있어요.
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

        {gb?.admin ? (
          <>
            {/* 확인 전이면 뽑아 둔 본문을, 확인을 마쳤으면 **챗봇이 지금 읽는 본문**을 연다.
                후자를 안 실으면 `챗봇 반영됨` 인데 상자가 비어 나온다(2026-09-03 신고). */}
            <SecondaryButton
              disabled={busy !== ''}
              onClick={() =>
                onReview(
                  gb.admin!.pendingText ?? gb.admin!.confirmedText ?? '',
                  gb.admin!.pendingText === null && gb.admin!.inChatbot
                )
              }
            >
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
  reflected,
  onClose,
  onSaved,
}: {
  teamName: string;
  teamId: string;
  initialText: string;
  /** 이미 챗봇에 반영된 본문인가. 안내 문구가 갈린다 — "확인해 주세요" 와 "지금 읽고 있는 것"은 다른 말이다. */
  reflected: boolean;
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
          {reflected ? (
            <>
              <b>챗봇이 지금 읽고 있는 내용</b>입니다. 고쳐서 저장하면 그대로 바뀝니다.
            </>
          ) : (
            <>
              가이드북에서 <b>봉사 운영 정보만</b> 뽑아낸 것입니다. 틀린 곳이 있으면 고쳐 주세요. 저장해야 챗봇이
              읽습니다. 비어 있으면 직접 적어 넣어도 됩니다.
            </>
          )}
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
            {saving ? '저장 중…' : reflected ? '고친 내용 저장' : '챗봇에 반영'}
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
