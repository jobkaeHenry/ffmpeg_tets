import { SAMPLE_GIF } from "../../shared/constants/sample";

export function ResultPanel({
  theme,
  outputUrl,
  outputFileName,
  isSample,
  originalUrl,
  originalSize,
  convertedSize,
  onAddPortfolio,
}: {
  theme: string;
  outputUrl: string | null;
  outputFileName: string;
  isSample: boolean;
  originalUrl: string | null;
  originalSize: number | null;
  convertedSize: number | null;
  onAddPortfolio: () => void;
}) {
  if (!outputUrl) return null;

  return (
    <div
      style={{
        marginTop: 32,
        width: "100%",
        maxWidth: 900,
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        textAlign: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
      }}
    >
      <h3
        style={{
          fontSize: 18,
          marginBottom: 20,
          fontWeight: 500,
          color: theme,
        }}
      >
        🖼 변환 결과 비교
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h4 style={{ fontSize: 15, fontWeight: 500 }}>원본</h4>
          {isSample ? (
            <img
              src={SAMPLE_GIF}
              alt="original"
              style={{ width: "100%", borderRadius: 12, marginBottom: 8 }}
            />
          ) : (
            originalUrl && (
              <img
                src={originalUrl}
                alt="original"
                style={{ width: "100%", borderRadius: 12, marginBottom: 8 }}
              />
            )
          )}
          {originalSize && (
            <p style={{ fontSize: 13, color: "#777" }}>
              {originalSize.toFixed(1)} KB
            </p>
          )}
        </div>

        <div>
          <h4 style={{ fontSize: 15, fontWeight: 500 }}>변환본 (WebP)</h4>
          <img
            src={outputUrl}
            alt="converted"
            style={{ width: "100%", borderRadius: 12, marginBottom: 8 }}
          />
          {convertedSize && (
            <p style={{ fontSize: 13, color: "#777" }}>
              {convertedSize.toFixed(1)} KB
            </p>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginTop: 20,
        }}
      >
        <a
          href={outputUrl}
          download={outputFileName}
          style={{
            padding: "12px 0",
            borderRadius: 8,
            border: `1px solid ${theme}`,
            color: theme,
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          {outputFileName} 다운로드
        </a>
        <button
          onClick={onAddPortfolio}
          style={{
            padding: "12px 0",
            borderRadius: 8,
            border: "none",
            background: theme,
            color: "#fff",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          📁 포트폴리오에 넣기
        </button>
      </div>
    </div>
  );
}
