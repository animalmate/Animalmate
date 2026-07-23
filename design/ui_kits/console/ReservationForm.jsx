import React, { useState } from "react";
import { Shell, PageTitle } from "./Shell.jsx";
import { Button } from "../../components/buttons/Button.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { Card } from "../../components/display/Card.jsx";
import { Banner } from "../../components/feedback/Banner.jsx";
import { Field } from "../../components/forms/Field.jsx";
import { Input } from "../../components/forms/Input.jsx";
import { Textarea } from "../../components/forms/Textarea.jsx";
import { Select } from "../../components/forms/Select.jsx";
import { RepeatRows } from "../../components/forms/RepeatRows.jsx";

/** 새 예약 작성 */
export function ReservationForm({ role = "board", mobile = false, onNavigate }) {
  const [kind, setKind] = useState("service");
  const [rows, setRows] = useState([{ date: "2026-08-02", meet: "09:00", pub: "2026-08-01T18:00" }]);
  const service = kind === "service";
  return (
    <Shell role={role} active="queue" mobile={mobile} onNavigate={onNavigate}>
      <PageTitle>새 예약</PageTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="종류">
              <div style={{ display: "flex", gap: 8, background: "var(--surface-sunken)", padding: 4, borderRadius: "var(--radius-md)" }}>
                {[["notice", "일반 공지"], ["service", "봉사 공지"]].map(([v, l]) => (
                  <button key={v} onClick={() => setKind(v)} style={{ flex: 1, height: 40, border: "none", borderRadius: 9, cursor: "pointer", font: "var(--text-btn)", background: kind === v ? "var(--surface-card)" : "transparent", color: kind === v ? "var(--text-title)" : "var(--text-muted)", boxShadow: kind === v ? "var(--shadow-card)" : "none" }}>{l}</button>
                ))}
              </div>
            </Field>
            <Field label="양식 불러오기" hint="저장한 양식을 선택하면 제목·본문이 채워져요"><Select placeholder="양식 선택 (선택 사항)" options={["주말 보호소 봉사 양식", "정기 회의 양식"]} /></Field>
            {service && <Field label="팀" required><Select placeholder="팀 선택" options={["주말 보호소팀", "급식소팀"]} /></Field>}
            <Field label="게시판" required><Select placeholder="게시판 선택" options={["봉사 공지", "자유 게시판"]} /></Field>
            <Field label="제목" required><Input placeholder="공지 제목을 입력해 주세요" /></Field>
            <Field label="본문" required hint="플레이스홀더 예: {{간결_날짜}} · {{집합시간}} · {{장소}}"><Textarea rows={5} placeholder="공지 본문을 입력해 주세요" /></Field>
          </div>
        </Card>
        <Card title="발행 일정">
          <RepeatRows items={rows} addLabel="일정 추가" onAdd={() => setRows([...rows, service ? { date: "", meet: "", pub: "" } : { pub: "" }])} onRemove={(i) => setRows(rows.filter((_, j) => j !== i))}
            renderItem={(r, i) => service ? (
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1.4fr", gap: 8 }}>
                <Field label="봉사일자"><Input type="date" defaultValue={r.date} style={{ height: "var(--control-h-sm)" }} /></Field>
                <Field label="집합시간"><Input type="time" defaultValue={r.meet} style={{ height: "var(--control-h-sm)" }} /></Field>
                <Field label="발행시각"><Input type="datetime-local" defaultValue={r.pub} style={{ height: "var(--control-h-sm)" }} /></Field>
              </div>
            ) : (
              <Field label="발행 날짜와 시간"><Input type="datetime-local" defaultValue={r.pub} style={{ height: "var(--control-h-sm)" }} /></Field>
            )} />
          {rows.length > 1 && <div style={{ marginTop: 12 }}><Banner kind="info" icon="layers">일정 {rows.length}개 → 예약 <strong>{rows.length}건</strong>이 한 번에 생성돼요.</Banner></div>}
        </Card>
        <Banner kind="info" icon="info">장소·정원은 예약 생성 후 각 건에서 개별 수정할 수 있어요.</Banner>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" block onClick={() => onNavigate && onNavigate("queue")}>취소</Button>
          <Button block icon={<Icon name="check" size={18} />}>예약 생성</Button>
        </div>
      </div>
    </Shell>
  );
}
