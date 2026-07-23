import React from "react";
import { Shell, PageTitle } from "./Shell.jsx";
import { Button } from "../../components/buttons/Button.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { Card } from "../../components/display/Card.jsx";
import { Banner } from "../../components/feedback/Banner.jsx";
import { Field } from "../../components/forms/Field.jsx";
import { Input } from "../../components/forms/Input.jsx";
import { Textarea } from "../../components/forms/Textarea.jsx";

/** 예약 개별 수정. published=true면 수정 불가 화면 */
export function ReservationEdit({ role = "board", mobile = false, published = false, service = true, onNavigate }) {
  return (
    <Shell role={role} active="queue" mobile={mobile} onNavigate={onNavigate}>
      <PageTitle>예약 수정</PageTitle>
      {published ? (
        <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 }}>
          <Banner kind="info" icon="info" title="이미 발행된 예약이에요">발행된 글은 수정할 수 없어요. 변경 사항은 카페 댓글로 안내해 주세요.</Banner>
          <Card title="이번 주 토요일 유기견 보호소 봉사">
            <p style={{ margin: "0 0 12px", font: "var(--text-body)", color: "var(--text-body)" }}>8월 2일(토) 09:00 집합 · 정문 앞 · 정원 12명</p>
            <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--text-btn)" }}><Icon name="external" size={16} />카페 글 보기</a>
          </Card>
        </div>
      ) : (
        <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="제목" required><Input defaultValue="이번 주 토요일 유기견 보호소 봉사" /></Field>
              <Field label="본문" required><Textarea rows={5} defaultValue={"{{전체_날짜}} 오전 9시, 정문 앞에서 모여요.\n편한 복장으로 와 주세요."} /></Field>
              <Field label="발행 시각" required><Input type="datetime-local" defaultValue="2026-08-01T18:00" /></Field>
            </div>
          </Card>
          {service && (
            <Card title="봉사 정보">
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <Field label="봉사 일시"><Input type="datetime-local" defaultValue="2026-08-02T09:00" /></Field>
                <Field label="정원"><Input type="number" defaultValue="12" /></Field>
                <Field label="장소" style={{ gridColumn: mobile ? "auto" : "1 / -1" }}><Input defaultValue="○○시 유기견 보호소 (정문 집합)" /></Field>
              </div>
            </Card>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" block onClick={() => onNavigate && onNavigate("queue")}>취소</Button>
            <Button block icon={<Icon name="check" size={18} />}>저장</Button>
          </div>
        </div>
      )}
    </Shell>
  );
}
