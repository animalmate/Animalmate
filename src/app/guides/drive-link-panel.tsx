'use client';
import { useState } from 'react';
import { apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input } from '@/components/ui';

/**
 * 홈 바로가기 주소 설정 — 구글 드라이브 · 건의함 · 신고함.
 *
 * 왜 체크리스트 화면에 있나: 기수가 바뀔 때마다 새로 만드는 값이라, 회장단이 학기 초에 훑는
 * 이 화면에 두는 편이 실제로 눈에 띈다(2026-07-31 사용자 요청).
 *
 * 세 칸을 한 상자에 둔다(2026-09-03 사용자 지시). 성격이 같은 값이고 — 기수마다 새로 만드는
 * 외부 주소 — 학기 초에 **한 번에 갈아 끼우는** 것이 실제 작업 단위이기 때문이다.
 * 다만 **보이는 범위는 다르다**: 드라이브는 운영진 이상, 건의함·신고함은 부원 포함 전원.
 */
interface Links {
  driveUrl: string | null;
  suggestUrl: string | null;
  reportUrl: string | null;
}

type Key = keyof Links;

const FIELDS: { key: Key; label: string; hint: string; placeholder: string }[] = [
  {
    key: 'driveUrl',
    label: '구글 드라이브 주소',
    hint: '운영 자료 보관함. 운영진 이상에게만 보여요.',
    placeholder: 'https://drive.google.com/drive/folders/...',
  },
  {
    key: 'suggestUrl',
    label: '건의함 주소',
    hint: '구글 폼 주소를 넣으면 홈에 바로가기가 생겨요. 부원에게도 보입니다.',
    placeholder: 'https://forms.gle/...',
  },
  {
    key: 'reportUrl',
    label: '신고함 주소',
    hint: '구글 폼 주소를 넣으면 홈에 바로가기가 생겨요. 부원에게도 보입니다.',
    placeholder: 'https://forms.gle/...',
  },
];

export function DriveLinkPanel({ initial }: { initial: Links }) {
  const blank = (v: string | null) => v ?? '';
  const [values, setValues] = useState<Record<Key, string>>({
    driveUrl: blank(initial.driveUrl),
    suggestUrl: blank(initial.suggestUrl),
    reportUrl: blank(initial.reportUrl),
  });
  const [saved, setSaved] = useState<Record<Key, string>>(values);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setDone(false);
    setBusy(true);
    const body = Object.fromEntries(FIELDS.map((f) => [f.key, values[f.key].trim()]));
    const r = await apiPost<Links>('/api/admin/links', body, 'PATCH');
    setBusy(false);
    if (!r.ok) {
      // 서버가 사람 말로 사유를 준다(https 만 허용 등). 없으면 공통 문구로.
      return setError(r.data.message || errorMessage(r.data.error));
    }
    const next: Record<Key, string> = {
      driveUrl: blank(r.data.driveUrl),
      suggestUrl: blank(r.data.suggestUrl),
      reportUrl: blank(r.data.reportUrl),
    };
    setValues(next);
    setSaved(next);
    setDone(true);
  }

  const dirty = FIELDS.some((f) => values[f.key].trim() !== saved[f.key]);

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-[17px] font-bold text-ink-900">홈 바로가기 주소</h2>
        <InfoText>
          홈 화면 아래쪽 바로가기 카드가 여기로 연결돼요. 기수마다 새로 만들면 이 주소만 바꿔 주세요.
          비워 두면 그 카드는 홈에서 사라져요.
        </InfoText>
      </div>

      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint}>
          <Input
            value={values[f.key]}
            onChange={(e) => {
              setValues((v) => ({ ...v, [f.key]: e.target.value }));
              setDone(false);
            }}
            placeholder={f.placeholder}
          />
        </Field>
      ))}

      <ErrorText>{error}</ErrorText>
      {done ? <p className="text-[13px] font-semibold text-success">저장했어요. 홈에서 바로 반영돼요.</p> : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button disabled={busy || !dirty} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </Button>
        {FIELDS.filter((f) => saved[f.key]).map((f) => (
          <a
            key={f.key}
            href={saved[f.key]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-ink-500 underline"
          >
            {f.label.replace(' 주소', '')} 열어 보기
          </a>
        ))}
      </div>
    </Card>
  );
}
