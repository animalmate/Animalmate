'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Card, Button, SecondaryButton, DangerButton, Field, Input, Textarea, Select, ErrorText, Banner } from '@/components/ui';
import { Icon } from '@/components/icon';

const VIS_TONE: Record<'member' | 'staff' | 'board', string> = {
  member: 'bg-success-100 text-success',
  staff: 'bg-blue-50 text-blue-600',
  board: 'bg-amber-50 text-amber-600',
};
function VisBadge({ v }: { v: 'member' | 'staff' | 'board' }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${VIS_TONE[v]}`}>{VIS_LABEL[v]}</span>;
}

interface DocRow {
  id: string;
  title: string;
  visibility: 'member' | 'staff' | 'board';
  ownerType: string;
  updatedAt: string;
}
interface Team {
  id: string;
  name: string;
}
interface PiiFinding {
  label: string;
  sample: string;
}

const VIS_LABEL: Record<DocRow['visibility'], string> = { member: '전체 부원', staff: '운영진', board: '회장단' };

interface Draft {
  id: string | null;
  title: string;
  contentMd: string;
  visibility: DocRow['visibility'];
  ownerType: 'personal' | 'team';
  ownerId: string;
}
const EMPTY: Draft = { id: null, title: '', contentMd: '', visibility: 'member', ownerType: 'personal', ownerId: '' };

export function DocumentsPanel({ canChooseTeam }: { canChooseTeam: boolean }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [pii, setPii] = useState<PiiFinding[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [d, t] = await Promise.all([apiGet<{ documents: DocRow[] }>('/api/documents'), apiGet<{ teams: Team[] }>('/api/teams')]);
    if (d.ok) setDocs(d.data.documents ?? []);
    if (t.ok) setTeams(t.data.teams ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function openEdit(id: string) {
    setError('');
    setPii(null);
    const r = await apiGet<{ document: Draft }>(`/api/documents/${id}`);
    if (r.ok) setDraft({ ...r.data.document });
    else setError(errorMessage(r.data.error));
  }

  async function save(piiAck = false) {
    if (!draft) return;
    setError('');
    setPii(null);
    setBusy(true);
    const body = {
      title: draft.title,
      contentMd: draft.contentMd,
      visibility: draft.visibility,
      ownerType: draft.ownerType,
      ownerId: draft.ownerType === 'team' ? draft.ownerId : undefined,
      piiAck,
    };
    const r = draft.id
      ? await apiPost(`/api/documents/${draft.id}`, body, 'PATCH')
      : await apiPost('/api/documents', body);
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

  if (draft) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button onClick={() => setDraft(null)} className="flex items-center gap-1 text-[14px] text-ink-500">
          <Icon name="chevronRight" size={16} className="rotate-180" /> 목록으로
        </button>
        <h1 className="text-[22px] font-bold text-ink-900">{draft.id ? '문서 수정' : '새 문서'}</h1>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="공개 범위" hint="이 등급 이상만 챗봇에서 검색돼요">
              <Select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as DocRow['visibility'] })}>
                <option value="member">전체 부원</option>
                <option value="staff">운영진</option>
                <option value="board">회장단</option>
              </Select>
            </Field>
            <Field label="소유">
              <Select
                value={draft.ownerType === 'team' ? `team:${draft.ownerId}` : 'personal'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'personal') setDraft({ ...draft, ownerType: 'personal', ownerId: '' });
                  else setDraft({ ...draft, ownerType: 'team', ownerId: v.slice(5) });
                }}
              >
                <option value="personal">개인(나)</option>
                {canChooseTeam
                  ? teams.map((t) => (
                      <option key={t.id} value={`team:${t.id}`}>
                        {t.name} 팀
                      </option>
                    ))
                  : null}
              </Select>
            </Field>
          </div>
          <Field label="내용 (마크다운)" hint="헤딩(##)으로 나누면 챗봇이 더 잘 찾아요">
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink-900">문서</h1>
          <p className="text-[13px] text-ink-500">챗봇이 답변 근거로 쓰는 안내 문서예요.</p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })}>
          <Icon name="plus" size={16} /> 새 문서
        </Button>
      </div>
      {docs.length === 0 ? (
        <Card>
          <p className="text-[14px] text-ink-500">아직 문서가 없어요. 회비·봉사 안내 같은 문서를 만들어 두면 챗봇이 답할 수 있어요.</p>
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
