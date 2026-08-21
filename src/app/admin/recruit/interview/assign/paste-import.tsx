'use client';
// 엑셀 면접 시간표 붙여넣기 — 이미 만들어 둔 표를 그대로 읽어 한 번에 배정한다.
//
// 왜 조를 먼저 고르게 하는가: 표 여러 장을 한꺼번에 받아 조까지 알아서 맞추려 하면 같은 시각이
// 조마다 있어 추측이 필요하고, 틀리면 조 하나가 통째로 뒤바뀐다. 조를 고정하면 대조 키가 시각
// 하나로 줄어 틀릴 구석이 없고, 실수해도 그 조 안에서 끝난다.
import { useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import { Icon } from '@/components/icon';
import { Button, SecondaryButton, Select, Textarea, Banner } from '@/components/ui';
import {
  buildImportPlan,
  assignmentsOf,
  ambiguousKey,
  summarizePlan,
  kstHm,
  type ImportApplicant,
  type ImportSlot,
  type MatchOutcome,
} from '@/recruit/timetable-import';

/** 판정별 칩 색. 사람이 훑을 때 "고쳐야 할 줄"이 먼저 눈에 들어와야 한다. */
const TONE: Record<MatchOutcome['kind'], string> = {
  ok: 'bg-green-100 text-green-800',
  same: 'bg-cream-100 text-ink-500',
  ambiguous: 'bg-amber-100 text-amber-800',
  unknown: 'bg-coral-100 text-coral-700',
};

export function PasteImportModal({
  slots,
  applicants,
  panelNames,
  onClose,
  onApply,
}: {
  /** 이 기수의 모든 슬롯. 고른 조로 걸러 쓴다. */
  slots: (ImportSlot & { durationMin?: number | null })[];
  applicants: ImportApplicant[];
  panelNames: string[];
  onClose: () => void;
  /** 확정된 배정을 저장한다. 성공하면 몇 명이 들어갔는지 돌려준다. */
  onApply: (assignments: { applicantId: string; slotId: string }[]) => Promise<void>;
}) {
  const [panel, setPanel] = useState(panelNames[0] ?? '');
  const [text, setText] = useState('');
  // 동명이인 판정에서 사람이 고른 지원자. 키는 ambiguousKey(슬롯+이름).
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const panelSlots = useMemo(
    () => slots.filter((s) => (s.panel ?? '').trim() === panel),
    [slots, panel]
  );

  // 붙여넣는 즉시 결과가 보여야 한다 — '확인' 버튼을 한 번 더 누르게 하면 잘못 붙였을 때
  // 그것을 알아채는 데 클릭이 하나 더 든다.
  const plan = useMemo(
    () => (text.trim() ? buildImportPlan({ text, slots: panelSlots, applicants }) : null),
    [text, panelSlots, applicants]
  );
  const summary = plan ? summarizePlan(plan) : null;
  const ready = plan ? assignmentsOf(plan.outcomes, resolved) : [];

  // 슬롯 id → '10:30' 라벨. 판정 목록을 시간 순으로 묶어 보여 준다.
  const hmOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of panelSlots) {
      const ms = new Date(s.startsAt).getTime();
      if (!Number.isNaN(ms)) m.set(s.id, kstHm(ms));
    }
    return m;
  }, [panelSlots]);

  // 시간대별로 접어 둔다. 200명을 한 줄로 늘어놓으면 어느 시간이 문제인지 안 보인다.
  const bySlot = useMemo(() => {
    const groups = new Map<string, MatchOutcome[]>();
    for (const o of plan?.outcomes ?? []) {
      const list = groups.get(o.slotId);
      if (list) list.push(o);
      else groups.set(o.slotId, [o]);
    }
    return [...groups.entries()].sort(
      ([a], [b]) => (hmOf.get(a) ?? '').localeCompare(hmOf.get(b) ?? '')
    );
  }, [plan, hmOf]);

  const handleApply = async () => {
    setSaving(true);
    try {
      await onApply(ready);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="엑셀 시간표 붙여넣기"
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-ink-500">
            {summary
              ? `배정 ${ready.length}명${summary.same > 0 ? ` · 그대로 ${summary.same}명` : ''}`
              : '표를 붙여넣으면 미리보기가 나옵니다.'}
          </span>
          <div className="flex gap-2">
            <SecondaryButton type="button" onClick={onClose}>
              취소
            </SecondaryButton>
            <Button type="button" onClick={handleApply} disabled={saving || ready.length === 0}>
              {saving ? '배정하는 중…' : `${ready.length}명 배정하기`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-ink-500">어느 조의 표인가요?</span>
            <Select value={panel} onChange={(e) => setPanel(e.target.value)} uiSize="sm" className="w-40">
              {panelNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-xs text-ink-500">
            엑셀·구글시트에서 <b>표 전체를 복사</b>해 아래에 붙여넣으세요. 머리글 줄이 있어도
            되고, 면접관 칸이 섞여 있어도 됩니다.
          </p>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={'면접관1\t면접관2\tA조\t면접자1\t면접자2\n운영진1\t운영진2\t10:30 ~ 11:00\t지원자1\t지원자2'}
          className="font-mono text-xs"
          aria-label="시간표 붙여넣기"
        />

        {panelSlots.length === 0 && (
          <Banner kind="warning" title={`"${panel}" 에 슬롯이 없습니다`}>
            먼저 위에서 이 조를 만들어 주세요. 붙여넣을 시간대가 없으면 아무것도 배정되지 않습니다.
          </Banner>
        )}

        {plan && summary && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              <Chip tone={TONE.ok}>배정 {summary.assign}명</Chip>
              {summary.moves > 0 && <Chip tone="bg-blue-100 text-blue-800">다른 조에서 옮김 {summary.moves}명</Chip>}
              {summary.same > 0 && <Chip tone={TONE.same}>이미 그 자리 {summary.same}명</Chip>}
              {summary.ambiguous > 0 && <Chip tone={TONE.ambiguous}>동명이인 {summary.ambiguous}명</Chip>}
              {summary.unknown > 0 && <Chip tone={TONE.unknown}>못 찾음 {summary.unknown}명</Chip>}
            </div>

            {/* 못 읽은 것들을 감추지 않는다 — 조용히 빠지면 면접 당일에야 빈자리를 발견한다. */}
            {plan.missingTimes.length > 0 && (
              <Banner kind="warning" title="이 조에 없는 시간대">
                {[...new Set(plan.missingTimes)].join(', ')} — 표에는 있는데 {panel} 슬롯에는 없는
                시각입니다. 조를 잘못 골랐거나 슬롯을 더 만들어야 합니다.
              </Banner>
            )}
            {plan.skipped.length > 0 && (
              <Banner kind="info" title="시간 칸을 못 읽어 넘어간 줄">
                {plan.skipped.slice(0, 5).join(' / ')}
                {plan.skipped.length > 5 && ` 외 ${plan.skipped.length - 5}줄`}
              </Banner>
            )}

            <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-xl border border-cream-200 p-3">
              {bySlot.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-400">읽어 낸 이름이 없습니다.</p>
              )}
              {bySlot.map(([slotId, outcomes]) => (
                <div key={slotId} className="flex flex-wrap items-start gap-2">
                  <span className="w-14 shrink-0 pt-0.5 text-xs font-bold text-ink-700">
                    {hmOf.get(slotId) ?? '—'}
                  </span>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {outcomes.map((o, i) => (
                      <OutcomeChip
                        key={`${o.name}-${i}`}
                        outcome={o}
                        picked={o.kind === 'ambiguous' ? resolved[ambiguousKey(o)] : undefined}
                        onPick={(applicantId) =>
                          setResolved((prev) => ({ ...prev, [ambiguousKey(o)]: applicantId }))
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {summary.unknown > 0 && (
              <p className="text-[11px] text-ink-500">
                <Icon name="info" size={12} className="inline" /> 빨간 이름은 서류 합격 명단에 없거나
                오타입니다. 이 사람들은 배정되지 않으니 표를 고치고 다시 붙여넣거나, 아래 표에서 직접
                배정해 주세요.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rounded-md px-2 py-0.5 ${tone}`}>{children}</span>;
}

function OutcomeChip({
  outcome,
  picked,
  onPick,
}: {
  outcome: MatchOutcome;
  picked?: string;
  onPick: (applicantId: string) => void;
}) {
  if (outcome.kind === 'ambiguous') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${TONE.ambiguous}`}>
        {outcome.name}
        {/* 동명이인은 사람이 고르기 전까지 배정하지 않는다 — 찍어서 넣으면 엉뚱한 사람이 면접을 본다.
            팀과 전화 뒷자리로 구분한다(전체 번호는 화면에 두지 않는다 — PII 최소화). */}
        <Select
          value={picked ?? ''}
          onChange={(e) => onPick(e.target.value)}
          className="h-5 w-28 border-none bg-white/70 px-1 text-[10px]"
          aria-label={`${outcome.name} 동명이인 선택`}
        >
          <option value="">누구인가요?</option>
          {outcome.candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.assignedTeam || c.wishTeam1 || '팀미지정'}
              {c.phone ? ` ${c.phone.slice(-4)}` : ''}
            </option>
          ))}
        </Select>
      </span>
    );
  }

  const moved = outcome.kind === 'ok' && outcome.fromSlotId !== null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
        moved ? 'bg-blue-100 text-blue-800' : TONE[outcome.kind]
      }`}
      title={
        outcome.kind === 'unknown'
          ? '명단에 없는 이름입니다 — 배정되지 않습니다'
          : outcome.kind === 'same'
            ? '이미 이 시간에 배정돼 있습니다'
            : moved
              ? '다른 조에서 이리로 옮깁니다'
              : undefined
      }
    >
      {outcome.name}
      {moved && <Icon name="refresh" size={10} className="inline" />}
      {outcome.kind === 'unknown' && <Icon name="alert" size={10} className="inline" />}
    </span>
  );
}
