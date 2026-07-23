'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input, Select, Textarea } from '@/components/ui';

interface Template {
  id: string;
  ownerType: string;
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
}
interface Team {
  id: string;
  name: string;
}

const OWNER_LABEL: Record<string, string> = { personal: '개인', team: '팀', global: '공용' };

export function TemplatesPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ownerType, setOwnerType] = useState('personal');
  const [teamId, setTeamId] = useState('');
  const [name, setName] = useState('');
  const [titleTemplate, setTitleTemplate] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('');
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

  async function create() {
    setError('');
    setBusy(true);
    const r = await apiPost('/api/templates', {
      ownerType,
      ownerId: ownerType === 'team' ? teamId : undefined,
      name: name.trim(),
      titleTemplate: titleTemplate.trim(),
      bodyTemplate: bodyTemplate.trim(),
    });
    setBusy(false);
    if (!r.ok) return setError(errorMessage(r.data.error, r.data.message));
    setName('');
    setTitleTemplate('');
    setBodyTemplate('');
    void load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">템플릿</h1>
      <Card className="space-y-3">
        <div className="font-medium">새 양식</div>
        <InfoText>
          제목·본문에 <code className="rounded bg-gray-100 px-1">{'{{날짜}}'}</code>{' '}
          <code className="rounded bg-gray-100 px-1">{'{{장소}}'}</code>{' '}
          <code className="rounded bg-gray-100 px-1">{'{{집합시간}}'}</code>{' '}
          <code className="rounded bg-gray-100 px-1">{'{{정원}}'}</code> 를 넣으면 생성 시 채워집니다.
        </InfoText>
        <Field label="소유">
          <Select value={ownerType} onChange={(e) => setOwnerType(e.target.value)}>
            <option value="personal">개인</option>
            <option value="team">팀</option>
            <option value="global">공용(회장단만)</option>
          </Select>
        </Field>
        {ownerType === 'team' ? (
          <Field label="팀">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
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
          <Input value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} placeholder="{{날짜}} 정기 봉사 안내" />
        </Field>
        <Field label="본문 양식">
          <Textarea rows={5} value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} placeholder={'집합 {{집합시간}} / 장소 {{장소}} / 정원 {{정원}}'} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !name || !titleTemplate || (ownerType === 'team' && !teamId)} onClick={create}>
          {busy ? '저장 중…' : '저장'}
        </Button>
      </Card>

      <Card>
        <div className="mb-2 font-medium">내 양식</div>
        {templates.length === 0 ? (
          <p className="text-sm text-gray-500">아직 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {templates.map((t) => (
              <li key={t.id} className="py-2">
                <div className="font-medium">
                  {t.name} <span className="text-xs text-gray-500">({OWNER_LABEL[t.ownerType] ?? t.ownerType})</span>
                </div>
                <div className="text-gray-500">{t.titleTemplate}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
