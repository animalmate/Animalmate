import React, { useState } from "react";
import { Shell, PageTitle } from "./Shell.jsx";
import { Button } from "../../components/buttons/Button.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { StatusBadge } from "../../components/display/StatusBadge.jsx";
import { Banner } from "../../components/feedback/Banner.jsx";
import { EmptyState } from "../../components/feedback/EmptyState.jsx";
import { Select } from "../../components/forms/Select.jsx";

const SAMPLE = [
  { id: 1, title: "이번 주 토요일 유기견 보호소 봉사", status: "scheduled", publishAt: "8월 1일(금) 18:00", board: "봉사 공지", serviceDate: "8월 2일(토) 09:00", kind: "service" },
  { id: 2, title: "8월 정기 회의 안내", status: "ready", publishAt: "7월 30일(수) 12:00", board: "자유 게시판", kind: "notice" },
  { id: 3, title: "고양이 급식소 봉사 모집", status: "draft", publishAt: "미정", board: "봉사 공지", missing: ["일시", "장소", "정원"], kind: "service" },
  { id: 4, title: "여름 봉사 후기 이벤트", status: "published", publishAt: "7월 20일(일) 10:00", board: "자유 게시판", link: "https://cafe.naver.com/…", kind: "notice" },
  { id: 5, title: "7월 넷째 주 보호소 봉사", status: "failed", publishAt: "7월 25일(금) 18:00", board: "봉사 공지", kind: "service" },
];

/** 예약 큐(목록) */
export function Queue({ role = "board", mobile = false, empty = false, onNavigate, onNew }) {
  const [team, setTeam] = useState("");
  return (
    <Shell role={role} active="queue" mobile={mobile} onNavigate={onNavigate}>
      <PageTitle action={!empty && <Button icon={<Icon name="plus" size={18} />} onClick={onNew}>새 예약</Button>}>예약 큐</PageTitle>
      {empty ? (
        <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--surface-card)" }}>
          <EmptyState icon="megaphone" title="아직 예약이 없어요" description="첫 공지를 예약하면 지정 시각에 카페로 자동 발행돼요." action={<Button icon={<Icon name="plus" size={18} />} onClick={onNew}>새 예약</Button>} />
        </div>
      ) : (
        <React.Fragment>
          <div style={{ maxWidth: 220, marginBottom: 14 }}>
            <Select value={team} onChange={(e) => setTeam(e.target.value)} options={[{ value: "", label: "전체 팀" }, { value: "1", label: "주말 보호소팀" }, { value: "2", label: "급식소팀" }]} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {SAMPLE.map((r) => <QueueCard key={r.id} r={r} mobile={mobile} />)}
          </div>
        </React.Fragment>
      )}
    </Shell>
  );
}

function QueueCard({ r, mobile }) {
  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)", padding: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, font: "var(--text-h3)", color: "var(--text-title)" }}>{r.title}</h3>
        <StatusBadge status={r.status} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: mobile ? "6px 14px" : "6px 20px", marginTop: 12, font: "var(--text-caption)", color: "var(--text-muted)" }}>
        <Meta icon="clock" label="발행" value={r.publishAt} />
        <Meta icon="board" label="게시판" value={r.board} />
        {r.serviceDate && <Meta icon="calendar" label="봉사일" value={r.serviceDate} />}
      </div>
      {r.missing && <div style={{ marginTop: 12 }}><Banner kind="warning" title="완성 처리하려면 항목을 채워주세요">{r.missing.join(" · ")}이(가) 비어 있어요.</Banner></div>}
      {r.status === "published" && (
        <div style={{ marginTop: 12 }}>
          <Banner kind="info" icon="info">발행된 글은 수정할 수 없어요. 변경 사항은 카페 댓글로 안내해 주세요.</Banner>
          <a href={r.link} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, font: "var(--text-btn)" }}><Icon name="external" size={16} />카페 글 보기</a>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {r.status === "published" ? (
          <Button variant="secondary" size="sm" disabled>수정 불가</Button>
        ) : (
          <React.Fragment>
            <Button variant="secondary" size="sm" icon={<Icon name="edit" size={15} />}>수정</Button>
            {r.status === "draft" && <Button size="sm">완성 처리</Button>}
            {r.status === "ready" && <Button size="sm">발행 대기로</Button>}
            {r.status === "failed" && <Button size="sm">다시 시도</Button>}
            <Button variant="destructive" size="sm">취소</Button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function Meta({ icon, label, value }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name={icon} size={14} /><strong style={{ color: "var(--text-faint)", fontWeight: 400 }}>{label}</strong>{value}</span>;
}
