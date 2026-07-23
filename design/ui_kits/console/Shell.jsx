import React from "react";
import { NavBar } from "../../components/navigation/NavBar.jsx";

/** 콘솔 공통 셸: 상단 네비 + 콘텐츠 컨테이너 */
export function Shell({ role = "board", active, mobile = false, onNavigate, onLogout, children }) {
  return (
    <div style={{ background: "var(--surface-page)", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <NavBar role={role} active={active} mobile={mobile} onNavigate={onNavigate} onLogout={onLogout} logoSrc="../../assets/logo-emblem.jpg" />
      <main style={{ flex: 1, width: "100%", maxWidth: mobile ? "none" : 1000, margin: "0 auto", padding: mobile ? "20px 16px 40px" : "28px 24px 56px" }}>
        {children}
      </main>
    </div>
  );
}

/** 화면 제목 행: 제목 + 우측 액션 */
export function PageTitle({ children, action, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, ...style }}>
      <h1 style={{ margin: 0, font: "var(--text-h1)", color: "var(--text-title)" }}>{children}</h1>
      {action}
    </div>
  );
}
