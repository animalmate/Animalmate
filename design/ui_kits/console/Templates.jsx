import React, { useState } from "react";
import { Shell, PageTitle } from "./Shell.jsx";
import { Button } from "../../components/buttons/Button.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { Card } from "../../components/display/Card.jsx";
import { CodeChip } from "../../components/display/CodeChip.jsx";
import { Field } from "../../components/forms/Field.jsx";
import { Input } from "../../components/forms/Input.jsx";
import { Textarea } from "../../components/forms/Textarea.jsx";
import { Select } from "../../components/forms/Select.jsx";
import { IconButton } from "../../components/buttons/IconButton.jsx";

const PLACEHOLDERS = [
  ["{{간결_날짜}}", "07/23"], ["{{전체_날짜}}", "2026년 7월 23일 목요일"],
  ["{{집합시간}}", "09:00"], ["{{팀장단}}", "김하늘 외 2명"], ["{{장소}}", "정문 앞"], ["{{정원}}", "12명"],
];
const MINE = [
  { name: "주말 보호소 봉사 양식", owner: "공용", title: "{{간결_날짜}} 유기견 보호소 봉사" },
  { name: "정기 회의 양식", owner: "개인", title: "{{전체_날짜}} 정기 회의 안내" },
  { name: "급식소팀 봉사 양식", owner: "팀 · 급식소팀", title: "{{간결_날짜}} 길고양이 급식소 봉사" },
];

/** 템플릿 관리 */
export function Templates({ role = "board", mobile = false, onNavigate }) {
  const [owner, setOwner] = useState("personal");
  return (
    <Shell role={role} active="templates" mobile={mobile} onNavigate={onNavigate}>
      <PageTitle>템플릿</PageTitle>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="새 양식">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="소유">
              <div style={{ display: "flex", gap: 8, background: "var(--surface-sunken)", padding: 4, borderRadius: "var(--radius-md)" }}>
                {[["personal", "개인"], ["team", "팀"], ["public", "공용"]].map(([v, l]) => (
                  <button key={v} onClick={() => setOwner(v)} style={{ flex: 1, height: 38, border: "none", borderRadius: 9, cursor: "pointer", font: "var(--text-btn)", background: owner === v ? "var(--surface-card)" : "transparent", color: owner === v ? "var(--text-title)" : "var(--text-muted)", boxShadow: owner === v ? "var(--shadow-card)" : "none" }}>{l}</button>
                ))}
              </div>
            </Field>
            {owner === "team" && <Field label="팀" required><Select placeholder="팀 선택" options={["주말 보호소팀", "급식소팀"]} /></Field>}
            <Field label="이름" required><Input placeholder="예: 주말 보호소 봉사 양식" /></Field>
            <Field label="제목 양식" required><Input placeholder="{{간결_날짜}} 유기견 보호소 봉사" /></Field>
            <Field label="본문 양식" required><Textarea rows={4} placeholder={"{{전체_날짜}} {{집합시간}}, {{장소}}에서 모여요.\n정원 {{정원}}."} /></Field>
            <div style={{ background: "var(--blue-50)", borderRadius: "var(--radius-md)", padding: 14 }}>
              <strong style={{ display: "block", font: "var(--text-label)", color: "var(--blue-800)", marginBottom: 10 }}>사용 가능한 플레이스홀더</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px" }}>
                {PLACEHOLDERS.map(([c, h]) => <CodeChip key={c} hint={h}>{c}</CodeChip>)}
              </div>
            </div>
            <Button icon={<Icon name="check" size={18} />}>저장</Button>
          </div>
        </Card>
        <Card title="내 양식" action={<span style={{ font: "var(--text-caption)", color: "var(--text-muted)" }}>{MINE.length}개</span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {MINE.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ font: "var(--text-h3)", color: "var(--text-title)" }}>{t.name}</strong>
                    <span style={{ font: "var(--text-badge)", color: "var(--text-muted)", background: "var(--surface-sunken)", borderRadius: 6, padding: "2px 8px" }}>{t.owner}</span>
                  </div>
                  <p style={{ margin: "4px 0 0", font: "var(--text-caption)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</p>
                </div>
                <IconButton icon={<Icon name="edit" size={17} />} label="수정" />
                <IconButton icon={<Icon name="trash" size={17} />} label="삭제" variant="danger" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
