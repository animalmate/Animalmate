빈 상태(예약/팀/템플릿/게시판 없음). 안내 + 액션 유도.

```jsx
<EmptyState icon="megaphone" title="아직 예약이 없어요"
  description="첫 공지를 예약하면 지정 시각에 카페로 자동 발행돼요."
  action={<Button icon={<Icon name="plus" size={18}/>}>새 예약</Button>} />
```
