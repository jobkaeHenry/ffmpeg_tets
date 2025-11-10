export function CompressionControl({
  label,
  value,
  setValue,
  min,
  max,
  step = 1,
  theme,
}: {
  label: string;
  value: number;
  setValue: (v: number | ((prev: number) => number)) => void;
  min: number;
  max: number;
  step?: number;
  theme: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label
        style={{
          fontSize: 14,
          color: "#555",
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}: {value}
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${theme}33`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setValue((prev) => (Number(prev) > min ? Number(prev) - step : prev))}
          style={{
            flex: "0 0 40px",
            height: 38,
            border: "none",
            background: "transparent",
            fontSize: 20,
            color: theme,
            cursor: "pointer",
          }}
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const newValue = Number(e.target.value);
            if (newValue >= min && newValue <= max) setValue(newValue);
          }}
          style={{
            flex: 1,
            textAlign: "center",
            border: "none",
            outline: "none",
            height: 38,
            fontSize: 15,
          }}
        />
        <button
          onClick={() => setValue((prev) => (Number(prev) < max ? Number(prev) + step : prev))}
          style={{
            flex: "0 0 40px",
            height: 38,
            border: "none",
            background: "transparent",
            fontSize: 20,
            color: theme,
            cursor: "pointer",
          }}
        >
          +
        </button>
      </div>
      <small style={{ color: "#777" }}>
        0 = 빠름 / 6 = 최대 압축 (용량 ↓, 속도 ↓)
      </small>
    </div>
  );
}
