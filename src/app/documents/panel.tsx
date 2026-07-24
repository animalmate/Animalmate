'use client';
import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Card, Button, SecondaryButton, DangerButton, Field, Input, Textarea, Select, ErrorText, Banner } from '@/components/ui';
import { Icon } from '@/components/icon';

type Visibility = 'member' | 'staff' | 'board';
const VIS_LABEL: Record<Visibility, string> = { member: '전체 부원', staff: '운영진', board: '회장단' };
const VIS_TONE: Record<Visibility, string> = {
  member: 'bg-success-100 text-success',
  staff: 'bg-blue-50 text-blue-600',
  board: 'bg-amber-50 text-amber-600',
};
function VisBadge({ v }: { v: Visibility }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${VIS_TONE[v]}`}>{VIS_LABEL[v]}</span>;
}

// 공개 범위별 생성 진입점 — 어떤 문서를 넣는지 예시로 안내한다(결정 19).
const NEW_KINDS: { visibility: Visibility; title: string; examples: string }[] = [
  { visibility: 'member', title: '부원·운영진 공개 문서', examples: '동아리 회칙, 운영진 구성, 가이드북(부원용), 동아리 일정 등' },
  { visibility: 'staff', title: '운영진 공개 문서', examples: '부원 명단, 가이드북(운영진용), 동아리행사, 신입기수 면접 등' },
];

interface DocRow {
  id: string;
  title: string;
  visibility: Visibility;
  updatedAt: string;
}
interface PiiFinding {
  label: string;
  sample: string;
}
interface Draft {
  id: string | null;
  title: string;
  contentMd: string;
  visibility: Visibility;
}

export function DocumentsPanel() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [pii, setPii] = useState<PiiFinding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await apiGet<{ documents: DocRow[] }>('/api/documents');
    if (r.ok) setDocs(r.data.documents ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  // 파일 업로드(.md/.txt) — 본문을 채우고, 제목이 비어 있으면 파일명으로.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !draft) return;
    const text = await file.text();
    const nameNoExt = file.name.replace(/\.(md|markdown|txt)$/i, '');
    setDraft({ ...draft, contentMd: text, title: draft.title.trim() || nameNoExt });
    setPii(null);
    setError('');
  }

  async function openEdit(id: string) {
    setError('');
    setPii(null);
    const r = await apiGet<{ document: Draft }>(`/api/documents/${id}`);
    if (r.ok) setDraft({ id: r.data.document.id, title: r.data.document.title, contentMd: r.data.document.contentMd, visibility: r.data.document.visibility });
    else setError(errorMessage(r.data.error));
  }

  async function save(piiAck = false) {
    if (!draft) return;
    setError('');
    setPii(null);
    setBusy(true);
    // 소유는 받지 않는다 — 서버가 생성자(개인) 소유로 둔다. 회장단·시스템관리자는 전체 편집 가능.
    const body = { title: draft.title, contentMd: draft.contentMd, visibility: draft.visibility, piiAck };
    const r = draft.id ? await apiPost(`/api/documents/${draft.id}`, body, 'PATCH') : await apiPost('/api/documents', body);
    setBusy(false);
    if (r.status === 422 && r.data.error === 'pii') {
      setPii((r.data as { findings?: PiiFinding[] }).findings ?? []);
      return;
    }
    if (!r.ok) return setError(errorMessage(r.data.error));
    setDraft(null);
    void load();
  }

  async function del(id: string) {
    if (!confirm('이 문서를 삭제할까요? 챗봇 검색에서도 사라져요.')) return;
    const r = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (r.ok) {
      if (draft?.id === id) setDraft(null);
      void load();
    }
  }

  // ── 에디터 ──────────────────────────────────────────────────────────
  if (draft) {
    const kind = NEW_KINDS.find((k) => k.visibility === draft.visibility);
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button onClick={() => setDraft(null)} className="flex items-center gap-1 text-[14px] text-ink-500">
          <Icon name="chevronRight" size={16} className="rotate-180" /> 목록으로
        </button>
        <div>
          <h1 className="text-[22px] font-bold text-ink-900">{draft.id ? '문서 수정' : '새 문서'}</h1>
          {kind && !draft.id ? <p className="mt-1 text-[13px] text-ink-500">예: {kind.examples}</p> : null}
        </div>
        {pii ? (
          <Banner kind="warning" title="개인정보로 보이는 내용이 있어요">
            <div className="space-y-1 text-[13px]">
              {pii.map((f, i) => (
                <div key={i}>
                  • {f.label} <span className="text-ink-400">({f.sample})</span>
                </div>
              ))}
              <p className="mt-2">회원 명단·연락처·계좌는 챗봇 자료에 넣지 마세요. 그래도 저장하려면 아래 버튼을 눌러주세요.</p>
              <SecondaryButton className="mt-2" disabled={busy} onClick={() => void save(true)}>
                확인했고 그대로 저장
              </SecondaryButton>
            </div>
          </Banner>
        ) : null}
        <Card className="space-y-4">
          <Field label="제목">
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 회비 안내" />
          </Field>
          <Field label="공개 범위" hint="부원 공개면 전원이, 운영진 공개면 운영진·회장단만 챗봇에서 검색해요">
            <Select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as Visibility })}>
              <option value="member">부원·운영진 공개</option>
              <option value="staff">운영진 공개</option>
            </Select>
          </Field>
          <Field label="내용 (마크다운)" hint="헤딩(##)으로 나누면 챗봇이 더 잘 찾아요. 직접 쓰거나 파일을 올려도 돼요.">
            <div className="mb-2">
              <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={onFile} hidden />
              <SecondaryButton type="button" onClick={() => fileRef.current?.click()}>
                <Icon name="layers" size={15} /> 파일 올리기 (.md · .txt)
              </SecondaryButton>
            </div>
            <Textarea
              value={draft.contentMd}
              onChange={(e) => setDraft({ ...draft, contentMd: e.target.value })}
              rows={14}
              placeholder={'## 회비\n한 학기 회비는 2만원입니다.'}
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button disabled={busy || !draft.title.trim()} onClick={() => void save(false)}>
              {busy ? '저장 중…' : '저장'}
            </Button>
            {draft.id ? <DangerButton onClick={() => void del(draft.id!)}>삭제</DangerButton> : null}
          </div>
        </Card>
      </div>
    );
  }

  // ── 목록 ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink-900">문서</h1>
        <p className="mt-1 text-[13px] text-ink-500">챗봇이 답변 근거로 쓰는 안내 문서예요. 공개 범위를 골라 새로 만들어요.</p>
      </div>

      {/* 공개 범위별 생성 진입점 두 개 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {NEW_KINDS.map((k) => (
          <button
            key={k.visibility}
            onClick={() => setDraft({ id: null, title: '', contentMd: '', visibility: k.visibility })}
            className="text-left"
          >
            <Card className="flex h-full items-start gap-3 transition-colors hover:border-blue-300">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon name="plus" size={18} />
              </span>
              <span className="min-w-0">
                <strong className="block text-[15px] font-semibold text-ink-900">{k.title}</strong>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-400">{k.examples}</span>
              </span>
            </Card>
          </button>
        ))}
      </div>

      {docs.length === 0 ? (
        <Card>
          <p className="text-[14px] text-ink-500">아직 문서가 없어요. 위에서 공개 범위를 골라 첫 문서를 만들어 보세요.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Card key={d.id} className="flex items-center gap-3">
              <button onClick={() => void openEdit(d.id)} className="min-w-0 flex-1 text-left">
                <strong className="block truncate text-[15px] font-semibold text-ink-900">{d.title}</strong>
                <span className="text-[12px] text-ink-400">{new Date(d.updatedAt).toLocaleDateString('ko-KR')} 수정</span>
              </button>
              <VisBadge v={d.visibility} />
              <button onClick={() => void del(d.id)} aria-label="삭제" className="text-ink-300 hover:text-coral-500">
                <Icon name="trash" size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
