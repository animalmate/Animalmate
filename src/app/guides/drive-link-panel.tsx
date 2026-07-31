'use client';
import { useState } from 'react';
import { apiPost, errorMessage } from '@/lib/api';
import { Button, Card, ErrorText, Field, InfoText, Input } from '@/components/ui';

/**
 * 홈 "구글 드라이브" 바로가기 주소 설정.
 *
 * 왜 체크리스트 화면에 있나: 기수가 바뀔 때마다 새로 만드는 값이라, 회장단이 학기 초에 훑는
 * 이 화면에 두는 편이 실제로 눈에 띈다(2026-07-31 사용자 요청).
 */
export function DriveLinkPanel({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [saved, setSaved] = useState(initialUrl ?? '');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setDone(false);
    setBusy(true);
    const r = await apiPost('/api/admin/links', { driveUrl: url.trim() }, 'PATCH');
    setBusy(false);
    if (!r.ok) {
      // 서버가 사람 말로 사유를 준다(https 만 허용 등). 없으면 공통 문구로.
      return setError(r.data.message || errorMessage(r.data.error));
    }
    const next = (r.data as { driveUrl?: string | null }).driveUrl ?? '';
    setUrl(next);
    setSaved(next);
    setDone(true);
  }

  const dirty = url.trim() !== saved;

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-[17px] font-bold text-ink-900">구글 드라이브 바로가기</h2>
        <InfoText>
          홈 화면의 <b>구글 드라이브</b> 바로가기가 여기로 연결돼요. 기수마다 드라이브를 새로 만들면
          이 주소만 바꿔 주세요. <b>운영진 이상에게만 보입니다.</b>
        </InfoText>
      </div>

      <Field
        label="드라이브 주소"
        hint="비워 두면 홈에서 바로가기 카드가 사라져요. https:// 로 시작하는 전체 주소를 넣어 주세요."
      >
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setDone(false);
          }}
          placeholder="https://drive.google.com/drive/folders/..."
        />
      </Field>

      <ErrorText>{error}</ErrorText>
      {done ? <p className="text-[13px] font-semibold text-success">저장했어요. 홈에서 바로 반영돼요.</p> : null}

      <div className="flex items-center gap-2">
        <Button disabled={busy || !dirty} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </Button>
        {saved ? (
          <a href={saved} target="_blank" rel="noopener noreferrer" className="text-[13px] underline text-ink-500">
            지금 연결된 주소 열어 보기
          </a>
        ) : null}
      </div>
    </Card>
  );
}
