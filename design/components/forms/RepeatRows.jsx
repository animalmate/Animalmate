import React from "react";
import { Icon } from "../display/Icon.jsx";

/** 반복 행 그룹: 행 추가/삭제가 되는 리스트 (발행 일정 여러 개, 팀장단 여러 명).
 * items 배열을 renderItem으로 그리고, 각 행 우측에 삭제 버튼, 하단에 추가 버튼. */
export function RepeatRows({ items = [], renderItem, onAdd, onRemove, addLabel = "행 추가", minRows = 1, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, ...style }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "var(--surface-sunken)", border: "1px solid var(--ink-100)", borderRadius: "var(--radius-md)", padding: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{renderItem(item, i)}</div>
          <button aria-label={`${i + 1}번째 행 삭제`} title="행 삭제" disabled={items.length <= minRows}
            onClick={() => onRemove && onRemove(i)}
            style={{
              width: 36, height: 36, minWidth: 36, flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", borderRadius: 10, background: "transparent", cursor: items.length <= minRows ? "not-allowed" : "pointer",
              color: items.length <= minRows ? "var(--ink-300)" : "var(--error-600)",
            }}>
            <Icon name="trash" size={17} />
          </button>
        </div>
      ))}
      <button onClick={onAdd} style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: "var(--control-h)",
        border: "1.5px dashed var(--border-strong)", borderRadius: "var(--radius-md)", background: "transparent",
        color: "var(--text-link)", font: "var(--text-btn)", cursor: "pointer",
      }}>
        <Icon name="plus" size={17} />{addLabel}
      </button>
    </div>
  );
}
