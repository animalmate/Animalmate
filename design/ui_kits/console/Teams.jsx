import React, { useState } from "react";
import { Shell, PageTitle } from "./Shell.jsx";
import { Button } from "../../components/buttons/Button.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { Card } from "../../components/display/Card.jsx";
import { Banner } from "../../components/feedback/Banner.jsx";
import { Field } from "../../components/forms/Field.jsx";
import { Input } from "../../components/forms/Input.jsx";
import { Select } from "../../components/forms/Select.jsx";
import { RepeatRows } from "../../components/forms/RepeatRows.jsx";

const TEAMS = [
  { name: "주말 보호소팀", kind: "활동팀", active: true, hasSessions: true },
  { name: "급식소팀", kind: "활동팀", active: true, hasSessions: false },
  { name: "홍보팀", kind: "기능팀", active: false, hasSessions: false },
];

/** 조직(팀) 관리 */
export function Teams({ role = "board", mobile = false, onNavigate }) {
  const [openTeam, setOpenTeam] = useState(0);
  const [leads, setLeads] = useState([{ title: "팀장", name: "김하늘", phone: "010-1234-5678" }, { title: "부팀장", name: "이보라", phone: "010-9876-5432" }]);
  return (
    <Shell role={role} active="teams" mobile={mobile} onNavigate={onNavigate}>
      <PageTitle>조직</PageTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
        <Card title="팀 추가">
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "2fr 1fr auto", gap: 12, alignItems: "end" }}>
            <Field label="이름" required><Input placeholder="예: 주말 보호소팀" /></Field>
            <Field label="종류"><Select options={["활동팀", "기능팀"]} /></Field>
            <Button icon={<Icon name="plus" size={18} />}>추가</Button>
          </div>
        </Card>
        {TEAMS.map((t, i) => (
          <div key={i} style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)", padding: 18, opacity: t.active ? 1 : 0.7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ font: "var(--text-h3)", color: "var(--text-title)" }}>{t.name}</strong>
              <span style={{ font: "var(--text-badge)", color: "var(--text-muted)", background: "var(--surface-sunken)", borderRadius: 6, padding: "2px 8px" }}>{t.kind}</span>
              <span style={{ font: "var(--text-badge)", color: t.active ? "var(--success-700)" : "var(--ink-500)", background: t.active ? "var(--success-100)" : "var(--ink-100)", borderRadius: 999, padding: "2px 10px" }}>{t.active ? "활성" : "비활성"}</span>
              <span style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setOpenTeam(openTeam === i ? -1 : i)} icon={<Icon name="users" size={15} />}>팀장단</Button>
              <Button variant="secondary" size="sm">{t.active ? "비활성화" : "활성화"}</Button>
              <Button variant="destructive" size="sm" disabled={t.hasSessions}>삭제</Button>
            </div>
            {t.hasSessions && <div style={{ marginTop: 12 }}><Banner kind="error" title="삭제할 수 없어요">회차·예약이 남아 있는 팀이에요. 대신 비활성화해 주세요.</Banner></div>}
            {openTeam === i && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-default)" }}>
                <Field label="팀장단" hint="직함·이름·전화 — 행 추가/삭제">
                  <RepeatRows items={leads} addLabel="팀장단 추가" onAdd={() => setLeads([...leads, { title: "", name: "", phone: "" }])} onRemove={(k) => setLeads(leads.filter((_, j) => j !== k))}
                    renderItem={(r) => (
                      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "90px 1fr 1.2fr", gap: 8 }}>
                        <Input defaultValue={r.title} placeholder="직함" style={{ height: "var(--control-h-sm)" }} />
                        <Input defaultValue={r.name} placeholder="이름" style={{ height: "var(--control-h-sm)" }} />
                        <Input defaultValue={r.phone} placeholder="전화" style={{ height: "var(--control-h-sm)" }} />
                      </div>
                    )} />
                </Field>
                <Button size="sm" style={{ marginTop: 12 }} icon={<Icon name="check" size={15} />}>팀장단 저장</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Shell>
  );
}
