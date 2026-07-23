4종 버튼(primary/secondary/destructive/text) + 기본/hover/누름/disabled/loading 상태. 모바일 CTA는 `block`.

```jsx
<Button variant="primary" block icon={<Icon name="plus" size={18}/>}>새 예약</Button>
<Button variant="secondary" size="sm">수정</Button>
<Button variant="destructive" loading>취소 중…</Button>
```
