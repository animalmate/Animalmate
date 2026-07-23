import React, { useState } from "react";
import { Button } from "../../components/buttons/Button.jsx";
import { CountdownButton } from "../../components/buttons/CountdownButton.jsx";
import { Field } from "../../components/forms/Field.jsx";
import { Input } from "../../components/forms/Input.jsx";
import { OtpInput } from "../../components/forms/OtpInput.jsx";
import { Banner } from "../../components/feedback/Banner.jsx";

/** 인증 화면 (로그인/가입, 2단계). 네비 없음, 가운데 정렬 카드. */
export function Auth({ mode = "login", step: initialStep = 1, mobile = false, error = "", onSwitchMode }) {
  const [step, setStep] = useState(initialStep);
  const [email, setEmail] = useState("mate@univ.ac.kr");
  const [code, setCode] = useState("");
  const login = mode === "login";
  return (
    <div style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: mobile ? "32px 16px" : "48px 24px" }}>
      <img src="../../assets/logo-emblem.jpg" alt="애니멀메이트" style={{ width: 72, height: 72, borderRadius: 99, marginBottom: 14 }} />
      <h1 style={{ margin: "0 0 4px", font: "var(--text-h1)", color: "var(--text-title)" }}>애니멀메이트</h1>
      <p style={{ margin: "0 0 24px", font: "var(--text-body)", color: "var(--text-muted)" }}>동물봉사 동아리 운영 도우미</p>
      <div style={{ width: "100%", maxWidth: 400, background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-card)", padding: mobile ? 20 : 28, display: "flex", flexDirection: "column", gap: 16 }}>
        {step === 1 ? (
          <React.Fragment>
            <h2 style={{ margin: 0, font: "var(--text-h2)", color: "var(--text-title)" }}>{login ? "로그인" : "가입하기"}</h2>
            {!login && <Field label="이름" required><Input placeholder="실명을 입력해 주세요" /></Field>}
            <Field label="이메일" required hint={login ? undefined : "인증 코드를 받을 주소예요"}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@univ.ac.kr" />
            </Field>
            {!login && (
              <Field label="가입코드" required hint="운영진에게 받은 학기 코드를 입력해 주세요">
                <Input placeholder="예: ANIMAL-2026-2" />
              </Field>
            )}
            <Button block onClick={() => setStep(2)}>인증 코드 받기</Button>
            <p style={{ margin: 0, font: "var(--text-caption)", color: "var(--text-muted)", textAlign: "center" }}>
              {login ? <React.Fragment>처음이신가요? <Button variant="text" size="sm" onClick={onSwitchMode}>가입하기</Button></React.Fragment>
                : <React.Fragment>이미 계정이 있나요? <Button variant="text" size="sm" onClick={onSwitchMode}>로그인</Button></React.Fragment>}
            </p>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <h2 style={{ margin: 0, font: "var(--text-h2)", color: "var(--text-title)" }}>메일을 확인해 주세요</h2>
            <p style={{ margin: 0, font: "var(--text-body)", color: "var(--text-body)" }}>
              <strong style={{ color: "var(--text-title)" }}>{email}</strong>(으)로 6자리 코드를 보냈어요.
            </p>
            <Banner kind="info" icon="mail">네이버 메일은 인증 메일이 <strong>스팸함</strong>으로 갈 수 있어요.</Banner>
            <Field label="인증 코드" error={error || undefined}>
              <OtpInput value={code} onChange={setCode} invalid={!!error} />
            </Field>
            <Button block disabled={code.length < 6}>{login ? "로그인" : "가입 완료"}</Button>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <CountdownButton seconds={60} autoStart style={{ height: "var(--control-h-sm)", minHeight: 44 }} />
            </div>
            <Button variant="text" size="sm" onClick={() => setStep(1)} style={{ alignSelf: "center" }}>이메일 다시 입력</Button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
