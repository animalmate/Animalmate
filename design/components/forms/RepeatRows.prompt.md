행 추가/삭제 가능한 반복 행 그룹. 발행 일정 여러 개, 팀장단(직함·이름·전화) 여러 명에 사용.

```jsx
<RepeatRows items={rows} addLabel="일정 추가"
  renderItem={(r,i)=><div style={{display:"grid",gap:8}}>…inputs…</div>}
  onAdd={add} onRemove={rm} />
```
