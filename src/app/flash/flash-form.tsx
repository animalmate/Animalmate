'use client';
// 번개 열기·고치기 폼. 게시판(새로 열기)과 상세(고치기)가 같은 것을 쓴다 —
// 두 벌로 두면 칸 하나를 더할 때 한쪽만 고쳐지고, 그 사실은 사용자가 먼저 발견한다.
import { useState } from 'react';
import { apiPost, errorMessage } from '@/lib/api';
import { Button, SecondaryButton, Field, Input, Textarea, ErrorText, InfoText } from '@/components/ui';
import { Modal } from '@/components/modal';
import { CoHostPicker, type CoHost } from './co-host-picker';

export interface FlashDraft {
  title: string;
  meetDate: string;
  meetTime: string;
  place: string;
  details: string;
  capacity: string; // 빈 칸 = 인원 제한 없음
  coHosts: CoHost[];
}

export function emptyDraft(): FlashDraft {
  return { title: '', meetDate: '', meetTime: '', place: '', details: '', capacity: '', coHosts: [] };
}

/**
 * 번개 열기·고치기 팝업.
 *
 * **팝업까지 이 컴포넌트가 그리는 이유**: 저장 버튼이 `Modal` 의 **바닥 줄**에 있어야 한다.
 * 폼을 팝업 본문에 넣기만 하면 버튼이 스크롤 상자 안으로 들어가, 화면에 보이는 바닥 버튼은
 * `Modal` 기본값인 `닫기` 하나가 된다 — 채워 놓고 스크롤을 내려야 저장을 찾는다(QA 캡처에서 그랬다).
 * 바닥 줄을 채우려면 버튼이 저장 상태(`busy`)를 알아야 하고, 그 상태는 여기에 있다.
 *
 * @param id      주면 그 번개를 고친다(PATCH). 없으면 새로 연다(POST).
 * @param onDone  저장이 끝난 뒤. 새로 연 경우 만들어진 상태(pending|open)를 함께 준다 —
 *                부원에게는 "승인 대기"라는 사실이 결과의 전부라 화면이 그걸 말해 줘야 한다.
 */
export function FlashForm({
  id,
  initial,
  onDone,
  onCancel,
}: {
  id?: string;
  initial: FlashDraft;
  onDone: (status?: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<FlashDraft>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FlashDraft>(k: K, v: FlashDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setError('');
    setBusy(true);
    const body = {
      title: draft.title,
      meetDate: draft.meetDate,
      meetTime: draft.meetTime || null,
      place: draft.place || null,
      details: draft.details || null,
      capacity: draft.capacity === '' ? null : Number(draft.capacity),
      coHostIds: draft.coHosts.map((c) => c.userId),
    };
    const r = id ? await apiPost(`/api/flash/${id}`, body, 'PATCH') : await apiPost<{ status: string }>('/api/flash', body);
    setBusy(false);
    if (!r.ok) {
      // 서버가 사람 말로 준 사유(bad_input)를 그대로 보여 준다 — 사용자가 고칠 수 있는 입력 오류다.
      return setError((r.data as { message?: string }).message ?? errorMessage(r.data.error));
    }
    onDone((r.data as { status?: string }).status);
  }

  const footer = (
    <div className="flex gap-2">
      <SecondaryButton type="button" onClick={onCancel} disabled={busy} className="flex-1">
        그만두기
      </SecondaryButton>
      <Button type="button" onClick={save} disabled={busy} className="flex-[2]">
        {busy ? '저장 중…' : id ? '저장' : '번개 열기'}
      </Button>
    </div>
  );

  return (
    <Modal title={id ? '번개 고치기' : '번개 열기'} onClose={onCancel} size="lg" footer={footer}>
    <div className="space-y-4">
      <Field label="무슨 번개인가요" required>
        <Input
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="예: 홍대 방탈출 번개"
          maxLength={100}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="날짜" required>
          <Input type="date" value={draft.meetDate} onChange={(e) => set('meetDate', e.target.value)} />
        </Field>
        <Field label="만나는 시각" hint="아직 안 정했으면 비워 두세요">
          <Input type="time" value={draft.meetTime} onChange={(e) => set('meetTime', e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="어디서" hint="장소가 정해지면 채워 주세요">
          <Input value={draft.place} onChange={(e) => set('place', e.target.value)} maxLength={200} />
        </Field>
        <Field label="정원" hint="비워 두면 인원 제한이 없어요">
          <Input
            type="number"
            min={1}
            max={300}
            inputMode="numeric"
            value={draft.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </Field>
      </div>

      <Field label="세부 내용" hint="회비·준비물·고를 것(방탈출 테마 등)을 적어 두면 신청할 때 물어볼 일이 줄어요">
        <Textarea
          rows={5}
          value={draft.details}
          onChange={(e) => set('details', e.target.value)}
          maxLength={4000}
          placeholder={'예)\n테마는 1·2·3 중에 고르시면 돼요.\n인당 2만원, 현장에서 각자 결제합니다.'}
        />
      </Field>

      <Field label="함께 여는 사람" hint="넣은 사람도 신청 쪽지를 보고 답할 수 있어요">
        <CoHostPicker value={draft.coHosts} onChange={(v) => set('coHosts', v)} disabled={busy} />
      </Field>

      {!id ? (
        <InfoText>
          정원이 차도 신청은 계속 받아요 — 뒤에 온 사람은 대기 번호를 받고, 앞사람이 취소하면 자동으로 올라갑니다.
        </InfoText>
      ) : null}

      <ErrorText>{error}</ErrorText>
    </div>
    </Modal>
  );
}
