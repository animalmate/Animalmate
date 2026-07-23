라벨+힌트+오류 래퍼. 모든 입력 컨트롤은 이 안에 둔다.

```jsx
<Field label="이메일" hint="학교 이메일을 권장해요" error={err} required>
  <Input type="email" invalid={!!err} />
</Field>
```
