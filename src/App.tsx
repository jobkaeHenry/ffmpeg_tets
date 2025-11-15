import { useEffect, useMemo, useState } from "react";
import { useFFmpeg } from "./shared/lib/useFFmpeg";
import {
  convertToWebp as convertToWebpLib,
  convertToWebpOptimized,
  type ConversionResult,
} from "./features/convert/lib/convertToWebp";
import { ConversionControls } from "./widgets/conversion/ConversionControls";
import { ResultPanel } from "./widgets/result/ResultPanel";
import { THEME } from "./shared/config/theme";
import { ProgressBar } from "./shared/ui/ProgressBar";
import { SAMPLE_GIF } from "./shared/constants/sample";
import type { QualityMetrics } from "./features/convert/lib/qualityMetrics";

export default function App() {
  const {
    ffmpeg,
    ready,
    progress,
    loadingMessage,
    setProgress,
    setLoadingMessage,
    resetProgress,
  } = useFFmpeg();
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputFileName, setOutputFileName] = useState("converted.webp");
  const [isSample, setIsSample] = useState(false);
  const [quality, setQuality] = useState(85); // 🔹 q:v
  const [compression, setCompression] = useState(4); // 🔹 compression_level
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [convertedSize, setConvertedSize] = useState<number | null>(null);
  const [useOptimizer, setUseOptimizer] = useState(true); // 최적화 모드
  const [useLossless, setUseLossless] = useState(true); // 무손실 모드 (기본 활성화)
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics | null>(
    null
  );
  const [metadata, setMetadata] = useState<{
    frameCount: number;
    fps: number;
    width: number;
    height: number;
    hasAlpha: boolean;
  } | null>(null);
  const [encodingStrategy, setEncodingStrategy] = useState<string | null>(null);
  const onToggleSample = () => {
    setOutputUrl(null);
  };

  const originalUrl = useMemo(() => {
    if (isSample) return null;
    if (!inputFile) return null;
    return URL.createObjectURL(inputFile);
  }, [inputFile, isSample]);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
  }, [originalUrl]);

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [outputUrl]);

  const handleConvert = async () => {
    if (!ffmpeg) return;
    setOutputUrl(null);
    setConvertedSize(null);
    setQualityMetrics(null);
    setMetadata(null);
    resetProgress();

    try {
      let result: ConversionResult | null = null;

      if (isSample) {
        const res = await fetch(SAMPLE_GIF);
        const blob = await res.blob();
        setOriginalSize(blob.size / 1024);

        if (useOptimizer) {
          result = await convertToWebpOptimized({
            ffmpeg,
            input: SAMPLE_GIF,
            progressCallback: (prog, msg) => {
              setProgress(prog);
              setLoadingMessage(msg);
            },
            lossless: useLossless,
          });
        } else {
          result = await convertToWebpLib({
            ffmpeg,
            input: SAMPLE_GIF,
            quality,
            compression,
          });
        }
      } else if (inputFile) {
        setOriginalSize(inputFile.size / 1024);

        if (useOptimizer) {
          result = await convertToWebpOptimized({
            ffmpeg,
            input: inputFile,
            progressCallback: (prog, msg) => {
              setProgress(prog);
              setLoadingMessage(msg);
            },
            lossless: useLossless,
          });
        } else {
          result = await convertToWebpLib({
            ffmpeg,
            input: inputFile,
            quality,
            compression,
          });
        }
      }

      if (result) {
        setOutputUrl(result.url);
        setOutputFileName(result.outputName);
        setConvertedSize(result.sizeKB);
        setQualityMetrics(result.metrics || null);
        setMetadata(result.metadata || null);
        setEncodingStrategy(result.encodingStrategy || null);
        setProgress(100);
        setLoadingMessage("");
      }
    } catch (error) {
      console.error("변환 실패:", error);
      setLoadingMessage(`변환 실패: ${error}`);
      setProgress(0);
    }
  };

  const handleAddPortfolio = () => {
    alert("✅ 포트폴리오에 추가되었습니다!");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "#fafafa",
        fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
        color: "#111",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 16px",
      }}
    >
      <h1
        style={{
          fontWeight: 600,
          fontSize: "1.5rem",
          marginBottom: 32,
          color: THEME,
          textAlign: "center",
        }}
      >
        바나나브레드 GIF → WebP 변환기
      </h1>

      <ConversionControls
        theme={THEME}
        isSample={isSample}
        setIsSample={(v) => {
          setIsSample(
            typeof v === "function"
              ? (v as (p: boolean) => boolean)(isSample)
              : v
          );
        }}
        inputFile={inputFile}
        setInputFile={(f) => {
          setInputFile(f);
          if (f) {
            setIsSample(false);
            setOutputUrl(null);
          }
        }}
        quality={quality}
        setQuality={setQuality}
        compression={compression}
        setCompression={setCompression}
        onConvert={handleConvert}
        ready={ready}
        onToggleSample={onToggleSample}
      />

      {/* 최적화 모드 토글 */}
      <div
        style={{
          marginTop: 16,
          padding: 16,
          backgroundColor: "white",
          borderRadius: 8,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          maxWidth: 600,
          width: "100%",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={useOptimizer}
            onChange={(e) => setUseOptimizer(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>
            자동 최적화 모드 (AI 품질 분석)
          </span>
        </label>
        {useOptimizer && (
          <>
            <p
              style={{
                marginTop: 8,
                fontSize: "0.85rem",
                color: "#666",
                lineHeight: 1.5,
              }}
            >
              여러 설정 조합을 테스트하여 최적의 품질/용량 비율을 자동 탐색합니다.
              <br />
              SSIM ≥ 0.98, ΔE ≤ 2.3, 엣지 보존율 ≥ 95% 기준을 충족합니다.
            </p>

            {/* 무손실 모드 토글 */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  gap: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={useLossless}
                  onChange={(e) => setUseLossless(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                  무손실 압축 (Lossless)
                </span>
              </label>
              <p
                style={{
                  marginTop: 6,
                  fontSize: "0.8rem",
                  color: "#666",
                  lineHeight: 1.4,
                  marginLeft: 24,
                }}
              >
                {useLossless ? (
                  <>
                    ✓ 화질 손상 없이 원본과 100% 동일한 품질을 유지합니다.
                    <br />
                    파일 크기가 손실 압축보다 클 수 있지만 원본보다는 작습니다.
                  </>
                ) : (
                  <>
                    손실 압축 모드: 파일 크기를 더 줄이지만 약간의 화질 저하가 있을 수 있습니다.
                  </>
                )}
              </p>
            </div>
          </>
        )}
      </div>

      {/* 진행률 */}
      {progress > 0 && progress < 100 && (
        <ProgressBar
          progress={progress}
          theme={THEME}
          message={loadingMessage}
        />
      )}

      {/* 품질 메트릭 표시 */}
      {qualityMetrics && (
        <div
          style={{
            marginTop: 24,
            padding: 20,
            backgroundColor: "white",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            maxWidth: 600,
            width: "100%",
          }}
        >
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: 16,
              color: THEME,
            }}
          >
            품질 분석 결과
          </h3>

          {/* 사용된 인코딩 전략 표시 */}
          {encodingStrategy && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                backgroundColor: "#f0f9ff",
                borderRadius: 6,
                border: "1px solid #bae6fd",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "#0369a1", fontWeight: 500 }}>
                선택된 최적 전략:{" "}
                {encodingStrategy === "pure-lossless" && "완전 무손실 압축"}
                {encodingStrategy === "near-lossless" && "준무손실 압축 (시각적 무손실)"}
                {encodingStrategy === "hybrid" && "하이브리드 고품질 압축"}
                {encodingStrategy === "optimized-lossy" && "최적화 손실 압축"}
              </div>
            </div>
          )}
          <div style={{ display: "grid", gap: 12 }}>
            <MetricRow
              label="SSIM (구조적 유사도)"
              value={qualityMetrics.ssim.toFixed(4)}
              target="≥ 0.98"
              pass={qualityMetrics.ssim >= 0.98}
            />
            <MetricRow
              label="PSNR (신호 대 잡음비)"
              value={`${qualityMetrics.psnr.toFixed(2)} dB`}
              target="> 30 dB"
              pass={qualityMetrics.psnr > 30}
            />
            <MetricRow
              label="ΔE2000 (색차)"
              value={qualityMetrics.deltaE.toFixed(2)}
              target="≤ 2.3"
              pass={qualityMetrics.deltaE <= 2.3}
            />
            <MetricRow
              label="엣지 보존율"
              value={`${(qualityMetrics.edgePreservation * 100).toFixed(1)}%`}
              target="≥ 95%"
              pass={qualityMetrics.edgePreservation >= 0.95}
            />
          </div>
          {metadata && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
              <p style={{ fontSize: "0.9rem", color: "#666", margin: "4px 0" }}>
                프레임: {metadata.frameCount}개 | FPS: {metadata.fps} | 해상도: {metadata.width}×{metadata.height}
              </p>
              <p style={{ fontSize: "0.9rem", color: "#666", margin: "4px 0" }}>
                알파 채널: {metadata.hasAlpha ? "있음" : "없음"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 결과 섹션 */}
      <ResultPanel
        theme={THEME}
        outputUrl={outputUrl}
        outputFileName={outputFileName}
        isSample={isSample}
        originalUrl={originalUrl}
        originalSize={originalSize}
        convertedSize={convertedSize}
        onAddPortfolio={handleAddPortfolio}
      />
    </div>
  );
}

// 품질 메트릭 행 컴포넌트
function MetricRow({
  label,
  value,
  target,
  pass,
}: {
  label: string;
  value: string;
  target: string;
  pass: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 12px",
        backgroundColor: pass ? "#f0fdf4" : "#fef2f2",
        borderRadius: 6,
        border: `1px solid ${pass ? "#86efac" : "#fecaca"}`,
      }}
    >
      <div>
        <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "#111" }}>
          {label}
        </div>
        <div style={{ fontSize: "0.8rem", color: "#666", marginTop: 2 }}>
          목표: {target}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            color: pass ? "#16a34a" : "#dc2626",
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: "1.2rem" }}>{pass ? "✓" : "✗"}</span>
      </div>
    </div>
  );
}
