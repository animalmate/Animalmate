import React from "react";
import { Shell } from "./Shell.jsx";
import { MENUS } from "../../components/navigation/NavBar.jsx";
import { Icon } from "../../components/display/Icon.jsx";
import { Banner } from "../../components/feedback/Banner.jsx";
import { Card } from "../../components/display/Card.jsx";

const DESC = {
  queue: "공지 예약을 만들고 관리해요",
  templates: "자주 쓰는 양식을 저장해요",
  bulk: "정기 봉사를 한 번에 예약해요",
  teams: "팀과 팀장단을 관리해요",
  code: "학기별 가입코드를 발급해요",
  boards: "카페 게시판을 연결해요",
};

/** 홈/대시보드: 역할별 바로가기 카드 그리드 */
export function Home({ role = "board", mobile = false, userName = "김하늘", membershipInactive = false, onNavigate }) {
  const menus = MENUS[role] || [];
  return (
    <Shell role={role} active="home" mobile={mobile} onNavigate={onNavigate}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {membershipInactive && (
          <Banner kind="warning" title="이번 학기 멤버십이 아직 활성화되지 않았어요">새 학기 가입코드로 다시 등록하면 모든 기능을 쓸 수 있어요.</Banner>
        )}
        <div>
          <h1 style={{ margin: 0, font: "var(--text-display)", color: "var(--text-title)" }}>안녕하세요, {userName}님</h1>
          <p style={{ margin: "6px 0 0", font: "var(--text-body)", color: "var(--text-muted)" }}>
            {menus.length ? "오늘도 아이들을 위해 한 걸음 — 무엇부터 할까요?" : "동아리 소식은 네이버 카페에서 확인할 수 있어요."}
          </p>
        </div>
        {menus.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
            {menus.map((m) => (
              <button key={m.key} onClick={() => onNavigate && onNavigate(m.key)} style={{
                display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer",
                background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-card)", padding: 18, minHeight: 84, transition: "border-color .15s",
              }}>
                <span style={{ width: 46, height: 46, borderRadius: 14, background: "var(--blue-50)", color: "var(--blue-600)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <Icon name={m.icon} size={22} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", font: "var(--text-h3)", color: "var(--text-title)" }}>{m.label}</strong>
                  <span style={{ font: "var(--text-caption)", color: "var(--text-muted)" }}>{DESC[m.key]}</span>
                </span>
                <Icon name="chevronRight" size={18} style={{ marginLeft: "auto", color: "var(--ink-300)" }} />
              </button>
            ))}
          </div>
        ) : (
          <Card>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <img src="../../assets/logo-shapes.png" alt="" style={{ width: 72, height: 72, objectFit: "contain", flex: "none" }} />
              <div>
                <h3 style={{ margin: "0 0 4px", font: "var(--text-h3)", color: "var(--text-title)" }}>부원 전용 안내</h3>
                <p style={{ margin: 0, font: "var(--text-body)", color: "var(--text-body)" }}>
                  봉사 신청과 공지는 네이버 카페에서 진행돼요. 곧 이곳에서 자주 묻는 질문에 답해 주는 챗봇도 만날 수 있어요.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Shell>
  );
}
