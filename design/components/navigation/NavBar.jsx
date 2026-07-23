import React, { useState } from "react";
import { Icon } from "../display/Icon.jsx";
import { RoleBadge } from "../display/RoleBadge.jsx";

export const MENUS = {
  member: [],
  staff: [
    { key: "queue", label: "예약", icon: "megaphone" },
    { key: "templates", label: "템플릿", icon: "doc" },
    { key: "bulk", label: "일괄 생성", icon: "layers" },
  ],
  board: [
    { key: "queue", label: "예약", icon: "megaphone" },
    { key: "templates", label: "템플릿", icon: "doc" },
    { key: "bulk", label: "일괄 생성", icon: "layers" },
    { key: "teams", label: "조직", icon: "users" },
    { key: "code", label: "가입코드", icon: "key" },
    { key: "boards", label: "게시판", icon: "board" },
  ],
};
MENUS.sysadmin = MENUS.board;

/** 상단 네비 셸: 로고 + 역할별 메뉴 + 역할 배지 + 로그아웃.
 * 모바일(<800px 컨테이너)에서는 햄버거 → 풀폭 드로어. mobile prop으로 강제 가능. */
export function NavBar({ role = "member", active, onNavigate, userName = "", onLogout, mobile = false, logoSrc = "assets/logo-emblem.jpg" }) {
  const [open, setOpen] = useState(false);
  const menus = MENUS[role] || [];
  const go = (k) => { setOpen(false); onNavigate && onNavigate(k); };
  const item = (m, big) => (
    <button key={m.key} onClick={() => go(m.key)} style={{
      display: "flex", alignItems: "center", gap: big ? 12 : 7, cursor: "pointer",
      border: "none", borderRadius: "var(--radius-md)", font: "var(--text-btn)",
      padding: big ? "0 14px" : "0 12px", height: big ? 52 : 40, width: big ? "100%" : "auto",
      background: active === m.key ? "var(--blue-50)" : "transparent",
      color: active === m.key ? "var(--blue-700)" : "var(--text-body)",
    }}>
      <Icon name={m.icon} size={18} />{m.label}
    </button>
  );
  return (
    <header style={{ position: "relative", background: "var(--surface-card)", borderBottom: "1px solid var(--border-default)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 60, padding: "0 16px", maxWidth: 1120, margin: "0 auto" }}>
        <button onClick={() => go("home")} style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "none", cursor: "pointer", padding: 0 }}>
          <img src={logoSrc} alt="애니멀메이트" style={{ width: 32, height: 32, borderRadius: 99 }} />
          <strong style={{ font: "700 17px/1 var(--font-sans)", color: "var(--text-title)" }}>애니멀메이트</strong>
        </button>
        {!mobile && <nav style={{ display: "flex", gap: 2, marginLeft: 16 }}>{menus.map((m) => item(m))}</nav>}
        <span style={{ flex: 1 }} />
        <RoleBadge role={role} />
        {!mobile && (
          <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", font: "var(--text-caption)", padding: "8px 4px" }}>
            <Icon name="logout" size={16} />로그아웃
          </button>
        )}
        {mobile && menus.length > 0 && (
          <button onClick={() => setOpen(!open)} aria-label="메뉴" style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", color: "var(--text-title)" }}>
            <Icon name={open ? "x" : "menu"} size={22} />
          </button>
        )}
      </div>
      {mobile && open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "var(--surface-card)", borderBottom: "1px solid var(--border-default)", boxShadow: "var(--shadow-raised)", padding: 12, display: "flex", flexDirection: "column", gap: 2 }}>
          {menus.map((m) => item(m, true))}
          <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 12, border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", font: "var(--text-btn)", padding: "0 14px", height: 52, borderTop: "1px solid var(--ink-100)", marginTop: 6 }}>
            <Icon name="logout" size={18} />로그아웃
          </button>
        </div>
      )}
    </header>
  );
}
