import React from "react";
import { Shell, PageTitle } from "./Shell.jsx";
import { Button } from "../../components/buttons/Button.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { Card } from "../../components/display/Card.jsx";
import { Field } from "../../components/forms/Field.jsx";
import { Input } from "../../components/forms/Input.jsx";
import { Checkbox } from "../../components/forms/Checkbox.jsx";
import { IconButton } from "../../components/buttons/IconButton.jsx";

const BOARDS = [
  { menuid: "27", name: "봉사 공지", bot: true, active: true },
  { menuid: "14", name: "자유 게시판", bot: true, active: true },
  { menuid: "31", name: "가입 인사", bot: false, active: false },
];

/** 게시판 레지스트리 */
export function Boards({ role = "board", mobile = false, onNavigate }) {
  const [bot, setBot] = React.useState(true);
  return (
    <Shell role={role} active="boards" mobile={mobile} onNavigate={onNavigate}>
      <PageTitle>게시판</PageTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
        <Card title="게시판 추가">
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "120px 1fr auto", gap: 12, alignItems: "end" }}>
            <Field label="menuid" required><Input placeholder="예: 27" /></Field>
            <Field label="이름" required><Input placeholder="예: 봉사 공지" /></Field>
            <Button icon={<Icon name="plus" size={18} />}>추가</Button>
            <div style={{ gridColumn: mobile ? "auto" : "1 / -1" }}><Checkbox label="봇 글쓰기 허용" checked={bot} onChange={(e) => setBot(e.target.checked)} /></div>
          </div>
        </Card>
        <Card title="연결된 게시판" action={<span style={{ font: "var(--text-caption)", color: "var(--text-muted)" }}>{BOARDS.length}개</span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BOARDS.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", opacity: b.active ? 1 : 0.65 }}>
                <span style={{ font: "var(--text-code)", color: "var(--text-muted)", background: "var(--surface-sunken)", borderRadius: 6, padding: "3px 8px" }}>#{b.menuid}</span>
                <strong style={{ font: "var(--text-h3)", color: "var(--text-title)", flex: 1, minWidth: 0 }}>{b.name}</strong>
                {b.bot && <span style={{ font: "var(--text-badge)", color: "var(--blue-700)", background: "var(--blue-100)", borderRadius: 999, padding: "2px 10px" }}>봇 쓰기</span>}
                <span style={{ font: "var(--text-badge)", color: b.active ? "var(--success-700)" : "var(--ink-500)", background: b.active ? "var(--success-100)" : "var(--ink-100)", borderRadius: 999, padding: "2px 10px" }}>{b.active ? "활성" : "비활성"}</span>
                <IconButton icon={<Icon name="edit" size={17} />} label="수정" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
