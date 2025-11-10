import { CompressionControl } from "../../shared/ui/CompressionControl";

export function ConversionControls({
  theme,
  isSample,
  setIsSample,
  inputFile,
  setInputFile,
  quality,
  setQuality,
  compression,
  setCompression,
  onConvert,
  ready,
  onToggleSample,
}: {
  theme: string;
  isSample: boolean;
  setIsSample: (v: boolean | ((prev: boolean) => boolean)) => void;
  inputFile: File | null;
  setInputFile: (f: File | null) => void;
  quality: number;
  setQuality: (v: number) => void;
  compression: number;
  setCompression: (v: number | ((prev: number) => number)) => void;
  onConvert: () => void;
  ready: boolean;
  onToggleSample?: () => void;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: "24px",
        width: "100%",
        maxWidth: 420,
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
      }}
    >
      {!ready ? (
        <p style={{ textAlign: "center", color: "#999" }}>
          ⚙️ 바나나브레드 엔진을 로딩 중입니다...
        </p>
      ) : (
        <>
          {!isSample && (
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="file"
                style={{
                  display: "block",
                  marginBottom: 8,
                  fontSize: 14,
                  color: "#555",
                }}
              >
                변환할 GIF 파일 선택
              </label>
              <input
                id="file"
                type="file"
                accept="image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setInputFile(file);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 12px",
                  border: `1px solid ${theme}33`,
                  borderRadius: 8,
                  fontSize: 14,
                  marginBottom: 12,
                  color: "#333",
                }}
              />
              <small style={{ color: "#777" }}>
                또는 샘플 이미지를 사용할 수 있습니다.
              </small>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                fontSize: 14,
                color: "#555",
                display: "block",
                marginBottom: 6,
              }}
            >
              품질 : {quality}
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              style={{ width: "100%", accentColor: theme, cursor: "pointer" }}
            />
          </div>

          <CompressionControl
            label="압축 강도"
            value={compression}
            setValue={setCompression}
            min={0}
            max={6}
            theme={theme}
          />

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => {
                setIsSample((prev) => !prev);
                setInputFile(null);
                if (onToggleSample) {
                  onToggleSample();
                }
              }}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: isSample ? `2px solid ${theme}` : "1px solid #ccc",
                background: isSample ? `${theme}10` : "#fff",
                color: isSample ? theme : "#333",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {isSample ? "샘플 사용 중" : "샘플 사용"}
            </button>
            <button
              onClick={onConvert}
              disabled={!isSample && !inputFile}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: `1px solid ${theme}`,
                background: isSample || inputFile ? theme : "#ccc",
                color: "#fff",
                fontWeight: 500,
                cursor: isSample || inputFile ? "pointer" : "not-allowed",
              }}
            >
              변환하기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
