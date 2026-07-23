export interface NavBarProps {
  /** 역할에 따라 메뉴 구성이 달라짐 (member=메뉴 없음, staff=예약·템플릿·일괄, board/sysadmin=+조직·가입코드·게시판) */
  role: "member" | "staff" | "board" | "sysadmin";
  /** 활성 메뉴 key: queue | templates | bulk | teams | code | boards | home */
  active?: string;
  onNavigate?: (key: string) => void;
  userName?: string;
  onLogout?: () => void;
  /** true면 햄버거 + 드로어 (모바일 시안) */
  mobile?: boolean;
  logoSrc?: string;
}
