상단 네비 셸(전 화면 공통). 데스크톱=인라인 메뉴, 모바일=햄버거→풀폭 드로어(하단 탭 대신 — 메뉴 수가 역할별 0~6개로 가변이라 드로어가 안전).

```jsx
<NavBar role="board" active="queue" mobile onNavigate={go} onLogout={out} />
```
`MENUS`도 export — 홈 대시보드 바로가기 카드가 같은 정의를 공유.
