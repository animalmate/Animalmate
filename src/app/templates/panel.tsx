'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, SecondaryButton, Select, Textarea } from '@/components/ui';

interface Template {
  id: string;
  ownerType: string;
  ownerId: string | null;
  teamName: string | null;
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
  defaultPlace: string | null;
  defaultCapacity: number | null;
}
interface Team {
  id: string;
  name: string;
}

const OWNER_LABEL: Record<string, string> = { personal: '개인', team: '팀', global: '공용' };

function ownerText(t: Template): string {
  if (t.ownerType === 'team') return `팀 · ${t.teamName ?? '알 수 없음'}`;
  return OWNER_LABEL[t.ownerType] ?? t.ownerType;
}

export function TemplatesPanel({ isBoard = false }: { isBoard?: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ownerType, setOwnerType] = useState('personal');
  const [teamId, setTeamId] = useState('');
  const [name, setName] = useState('');
  const [titleTemplate, setTitleTemplate] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [defaultPlace, setDefaultPlace] = useState('');
  const [defaultCapacity, setDefaultCapacity] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [t, tm] = await Promise.all([
      apiGet<{ templates: Template[] }>('/api/templates'),
      apiGet<{ teams: Team[] }>('/api/teams'),
    ]);
    if (t.ok) setTemplates(t.data.templates ?? []);
    if (tm.ok) setTeams(tm.data.teams ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setOwnerType('personal');
    setTeamId('');
    setName('');
    setTitleTemplate('');
    setBodyTemplate('');
    setDefaultPlace('');
    setDefaultCapacity('');
  }

  function startEdit(t: Template) {
    setEditingId(t.id);
    setOwnerType(t.ownerType);
    setTeamId(t.ownerType === 'team' ? (t.ownerId ?? '') : '');
    setName(t.name);
    setTitleTemplate(t.titleTemplate);
    setBodyTemplate(t.bodyTemplate);
    setDefaultPlace(t.defaultPlace ?? '');
    setDefaultCapacity(t.defaultCapacity != null ? String(t.defaultCapacity) : '');
    setError('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    setError('');
    setBusy(true);
    const fields = {
      name: name.trim(),
      titleTemplate: titleTemplate.trim(),
      bodyTemplate: bodyTemplate.trim(),
      defaultPlace: defaultPlace.trim(),
      defaultCapacity,
    };
    const r = editingId
      ? await apiPost(`/api/templates/${editingId}`, fields, 'PATCH')
      : await apiPost('/api/templates', {
          ownerType,
          ownerId: ownerType === 'team' ? teamId : undefined,
          ...fields,
        });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error, r.data.message));
    resetForm();
    void load();
  }

  async function remove(t: Template) {
    if (typeof window !== 'undefined' && !window.confirm(`"${t.name}" 양식을 삭제할까요?`)) return;
    setError('');
    const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(errorMessage(d.error, d.message));
      return;
    }
    if (editingId === t.id) resetForm();
    void load();
  }

  const canSave = !!name.trim() && !!titleTemplate.trim() && (editingId !== null || ownerType !== 'team' || !!teamId);

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-ink-900">템플릿</h1>
      <Card className="space-y-3">
        <div className="font-medium">{editingId ? '양식 수정' : '새 양식'}</div>
        <InfoText>
          플레이스홀더(생성 시 자동 치환):{' '}
          <code className="rounded bg-cream-100 px-1">{'{{간결_날짜}}'}</code>(07/23){' '}
          <code className="rounded bg-cream-100 px-1">{'{{전체_날짜}}'}</code>(2026년 7월 23일 목요일){' '}
          <code className="rounded bg-cream-100 px-1">{'{{집합시간}}'}</code>{' '}
          <code className="rounded bg-cream-100 px-1">{'{{팀장단}}'}</code>(팀별 명단).{' '}
          <code className="rounded bg-cream-100 px-1">{'{{장소}}'}</code>{' '}
          <code className="rounded bg-cream-100 px-1">{'{{정원}}'}</code> 은 아래 기본값으로 채워지고, 회차별로 다르면 각
          예약 수정에서 바꾸면 됩니다(발행 직전에 반영).
        </InfoText>
        <Field label="소유">
          <Select value={ownerType} onChange={(e) => setOwnerType(e.target.value)} disabled={editingId !== null}>
            <option value="personal">개인</option>
            <option value="team">팀</option>
            {isBoard ? <option value="global">공용(회장단만)</option> : null}
          </Select>
        </Field>
        {ownerType === 'team' ? (
          <Field label="팀">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={editingId !== null}>
              <option value="">선택</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="양식 이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="정기 봉사 공지" />
        </Field>
        <Field label="제목 양식">
          <Input value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} placeholder="{{간결_날짜}} 정기 봉사 안내" />
        </Field>
        <Field label="본문 양식">
          <Textarea rows={5} value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} placeholder={'{{전체_날짜}} 봉사\n집합 {{집합시간}} / 장소 {{장소}} / 정원 {{정원}}\n\n문의:\n{{팀장단}}'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="기본 장소" hint="이 양식으로 만든 예약의 기본값">
            <Input value={defaultPlace} onChange={(e) => setDefaultPlace(e.target.value)} placeholder="양주 쉼터" />
          </Field>
          <Field label="기본 정원" hint="비우면 예약마다 직접 입력">
            <Input
              inputMode="numeric"
              value={defaultCapacity}
              onChange={(e) => setDefaultCapacity(e.target.value.replace(/\D/g, ''))}
              placeholder="20"
            />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button disabled={busy || !canSave} onClick={save}>
            {busy ? '저장 중…' : editingId ? '수정 저장' : '저장'}
          </Button>
          {editingId ? <SecondaryButton onClick={resetForm}>취소</SecondaryButton> : null}
        </div>
      </Card>

      <Card>
        <div className="mb-2 font-medium">양식 목록</div>
        {templates.length === 0 ? (
          <p className="text-sm text-ink-500">아직 없습니다.</p>
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="font-medium">
                    {t.name} <span className="text-xs text-ink-500">({ownerText(t)})</span>
                  </div>
                  <div className="truncate text-ink-500">{t.titleTemplate}</div>
                  {t.defaultPlace || t.defaultCapacity != null ? (
                    <div className="text-xs text-ink-500">
                      기본 {t.defaultPlace ?? '장소 미지정'}
                      {t.defaultCapacity != null ? ` · 정원 ${t.defaultCapacity}` : ''}
                    </div>
                  ) : null}
                </div>
                {isBoard || t.ownerType !== 'global' ? (
                  <span className="flex shrink-0 gap-2">
                    <SecondaryButton onClick={() => startEdit(t)}>수정</SecondaryButton>
                    <SecondaryButton onClick={() => remove(t)}>삭제</SecondaryButton>
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-ink-400">공용(읽기)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
