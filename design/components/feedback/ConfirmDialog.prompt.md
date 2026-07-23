확인 모달(예약 취소·팀 삭제·코드 재발급·템플릿 삭제). 파괴적 액션은 `danger`.

```jsx
<ConfirmDialog danger title="예약을 취소할까요?"
  description="발행 대기 중인 3건이 함께 취소돼요. 되돌릴 수 없어요."
  confirmLabel="예약 취소" onConfirm={…} onCancel={…} />
```
