import React, { useState } from "react";
import { Shell, PageTitle } from "./Shell.jsx";
import { Button } from "../../components/buttons/Button.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { Card } from "../../components/display/Card.jsx";
import { Banner } from "../../components/feedback/Banner.jsx";
import { StatusBadge } from "../../components/display/StatusBadge.jsx";
import { Field } from "../../components/forms/Field.jsx";
import { Input } from "../../components/forms/Input.jsx";
import { Select } from "../../components/forms/Select.jsx";

const PREVIEW = [
  { date: "8월 2일(토)", pub: "8월 1일(금) 18:00" },
  { date: "8월 9일(토)", pub: "8월 8일(금) 18:00" },
  { date: "8월 16일(토)", pub: "8월 15일(금) 18:00" },
  { date: "8월 23일(토)", pub: "8월 22일(금) 18:00" },
  { date: "8월 30일(토)", pub: "8월 29일(금) 18:00" },
];
const SKIPPED = [{ date: "7월 26일(토)", reason: "이미 지난 일정" }];

/** 일괄 생성 */
export function BulkCreate({ role = "board", mobile = false, onNavigate }) {
  const [previewed, setPreviewed] = useState(true);
  return (
    <Shell role={role} active="bulk" mobile={mobile} onNavigate={onNavigate}>
      <PageTitle>일괄 생성</PageTitle>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="생성 패턴">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="팀" required><Select placeholder="팀 선택" options={["주말 보호소팀", "급식소팀"]} /></Field>
            <Field label="게시판" required><Select placeholder="게시판 선택" options={["봉사 공지"]} /></Field>
            <Field label="양식"><Select placeholder="양식 선택" options={["주말 보호소 봉사 양식"]} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="몇째 주"><Select options={["매주", "첫째·셋째 주", "둘째·넷째 주"]} /></Field>
              <Field label="요일"><Select options={["토요일", "일요일", "수요일"]} /></Field>
              <Field label="집합 시간"><Input type="time" defaultValue="09:00" /></Field>
              <Field label="발행 시각"><Input type="time" defaultValue="18:00" /></Field>
              <Field label="발행 리드일" hint="봉사 며칠 전"><Input type="number" defaultValue="1" /></Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="시작 (년·월)"><Input type="month" defaultValue="2026-08" /></Field>
              <Field label="끝 (년·월)"><Input type="month" defaultValue="2026-08" /></Field>
            </div>
            <Button variant="secondary" icon={<Icon name="layers" size={17} />} onClick={() => setPreviewed(true)}>미리보기</Button>
          </div>
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card title="생성 예정" action={<span style={{ font: "var(--text-caption)", color: "var(--text-muted)" }}>{PREVIEW.length}건</span>}>
            {previewed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {PREVIEW.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", background: "var(--surface-sunken)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ font: "var(--text-body)", color: "var(--text-title)" }}><Icon name="calendar" size={14} style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--text-muted)" }} />{p.date}</span>
                    <span style={{ font: "var(--text-caption)", color: "var(--text-muted)" }}>발행 {p.pub}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ margin: 0, font: "var(--text-body)", color: "var(--text-muted)" }}>패턴을 설정하고 미리보기를 눌러 주세요.</p>}
          </Card>
          {previewed && SKIPPED.length > 0 && (
            <Banner kind="warning" title={`건너뛴 회차 ${SKIPPED.length}건`}>{SKIPPED.map((s) => `${s.date} — ${s.reason}`).join(", ")}</Banner>
          )}
          {previewed && <Button block icon={<Icon name="check" size={18} />}>확정 생성 ({PREVIEW.length}건)</Button>}
        </div>
      </div>
    </Shell>
  );
}
