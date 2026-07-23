import React from "react";
import { Shell, PageTitle } from "./Shell.jsx";
import { Button } from "../../components/buttons/Button.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { Card } from "../../components/display/Card.jsx";
import { CopyButton } from "../../components/buttons/CopyButton.jsx";
import { Banner } from "../../components/feedback/Banner.jsx";
import { Field } from "../../components/forms/Field.jsx";
import { Input } from "../../components/forms/Input.jsx";

/** 가입코드 */
export function JoinCode({ role = "board", mobile = false, onNavigate }) {
  const code = "ANIMAL-2026-2";
  return (
    <Shell role={role} active="code" mobile={mobile} onNavigate={onNavigate}>
      <PageTitle>가입코드</PageTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
        <Card>
          <p style={{ margin: "0 0 10px", font: "var(--text-caption)", color: "var(--text-muted)" }}>현재 활성 코드 · 2026년 2학기</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ font: "700 26px/1 var(--font-mono)", color: "var(--text-title)", letterSpacing: 1, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", padding: "12px 18px" }}>{code}</span>
            <CopyButton value={code} />
          </div>
        </Card>
        <Card title="발급 / 재발급">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="학기 라벨" required><Input placeholder="예: 2026년 2학기" /></Field>
            <Field label="코드" hint="비워 두면 자동으로 생성돼요"><Input placeholder="자동 생성" /></Field>
            <Banner kind="warning" title="재발급하면 기존 코드는 무효화돼요">지금 쓰는 가입코드로는 더 이상 가입할 수 없게 돼요.</Banner>
            <Button icon={<Icon name="key" size={17} />}>발급</Button>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
