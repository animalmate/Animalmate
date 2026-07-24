'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, Input, SecondaryButton, Select } from '@/components/ui';
import { AutoGrowTextarea } from '@/components/auto-grow-textarea';
import { PLACEHOLDERS, findPlaceholder } from '@/publishing/placeholder-catalog';
import { placeholderKeys } from '@/publishing/template-render';

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
  defaultMeetTime: string | null;
  defaultPublishTime: string | null;
}
interface Team {
  id: string;
  name: string;
}

const OWNER_LABEL: Record<string, string> = { personal: '개인', team: '팀', global: '공용' };
const TIME_STEP = 600; // 10분 단위

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
  const [defaultMeetTime, setDefaultMeetTime] = useState('');
  const [defaultPublishTime, setDefaultPublishTime] = useState('');
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
    setDefaultMeetTime('');
    setDefaultPublishTime('');
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
    setDefaultMeetTime(t.defaultMeetTime ?? '');
    setDefaultPublishTime(t.defaultPublishTime ?? '');
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
      defaultMeetTime,
      defaultPublishTime,
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
  const usedKeys = placeholderKeys(titleTemplate, bodyTemplate); // 작성 중인 양식이 쓰는 값(오타 확인용)

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-ink-900">템플릿</h1>
      <Card className="space-y-3">
        <div className="font-medium">{editingId ? '양식 수정' : '새 양식'}</div>
        <div className="rounded-md bg-cream-100 p-3">
          <div className="text-sm font-medium text-ink-700">회차마다 달라지는 값은 이렇게 적어 두세요</div>
          <p className="mt-0.5 text-xs text-ink-500">
            아래 표시를 본문에 그대로 쓰면 공지가 나갈 때 실제 값으로 바뀝니다. 장소처럼 늘 같은 내용은 그냥 적으세요.
          </p>
          <ul className="mt-2 space-y-1 text-[13px]">
            {PLACEHOLDERS.map((p) => (
              <li key={p.key} className="flex flex-wrap items-baseline gap-x-1.5">
                <code className="rounded bg-white px-1 text-ink-700">{`{{${p.key}}}`}</code>
                <span className="text-ink-900">{p.label}</span>
                <span className="text-ink-500">예: {p.example}</span>
              </li>
            ))}
          </ul>
        </div>
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
          <AutoGrowTextarea
            minRows={8}
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            placeholder={'{{전체_날짜}} 양주 쉼터 봉사\n집합 {{집합시간}} / 정원 {{정원}}\n\n문의:\n{{팀장단}}'}
          />
        </Field>
        <div className="rounded-md bg-cream-100 p-3">
          <div className="text-sm font-medium text-ink-700">예약할 때 미리 채워질 값</div>
          <p className="mt-0.5 text-xs text-ink-500">
            여기 넣어 두면 예약을 만들 때 봉사 일자와 업로드 날짜만 고르면 됩니다. 회차마다 다르면 그때 고치면 돼요.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="봉사 장소" hint="공지 본문에는 직접 적고, 이 값은 회차 기록용입니다">
              <Input value={defaultPlace} onChange={(e) => setDefaultPlace(e.target.value)} placeholder="양주 쉼터" />
            </Field>
            <Field label="정원">
              <Input
                inputMode="numeric"
                value={defaultCapacity}
                onChange={(e) => setDefaultCapacity(e.target.value.replace(/\D/g, ''))}
                placeholder="20"
              />
            </Field>
            <Field label="집합 시간">
              <Input
                type="time"
                step={TIME_STEP}
                value={defaultMeetTime}
                onChange={(e) => setDefaultMeetTime(e.target.value)}
              />
            </Field>
            <Field label="업로드 시각" hint="봉사 며칠 전에 올릴지는 예약에서 날짜로 고릅니다">
              <Input
                type="time"
                step={TIME_STEP}
                value={defaultPublishTime}
                onChange={(e) => setDefaultPublishTime(e.target.value)}
              />
            </Field>
          </div>
        </div>
        {usedKeys.length > 0 ? (
          <div className="text-[13px] text-ink-500">
            이 양식이 쓰는 값:{' '}
            {usedKeys.map((k, i) => {
              const info = findPlaceholder(k);
              return (
                <span key={k}>
                  {i > 0 ? ', ' : ''}
                  <code className="rounded bg-cream-100 px-1">{`{{${k}}}`}</code>
                  {info ? ` ${info.label}` : ' — 목록에 없는 이름입니다(오타 확인)'}
                </span>
              );
            })}
          </div>
        ) : null}
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
                  <div className="text-xs text-ink-500">
                    {[
                      t.defaultPlace,
                      t.defaultCapacity != null ? `${t.defaultCapacity}명` : null,
                      t.defaultMeetTime ? `집합 ${t.defaultMeetTime}` : null,
                      t.defaultPublishTime ? `업로드 ${t.defaultPublishTime}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-500">
                    {placeholderKeys(t.titleTemplate, t.bodyTemplate).map((k) => {
                      const info = findPlaceholder(k);
                      return (
                        <li key={k}>
                          <code className="rounded bg-cream-100 px-1">{`{{${k}}}`}</code>{' '}
                          {info ? `→ ${info.from}` : '→ 목록에 없는 이름(오타 확인)'}
                        </li>
                      );
                    })}
                  </ul>
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
