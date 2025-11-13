import { useEffect, useMemo, useState } from "react";
import { useFFmpeg } from "./shared/lib/useFFmpeg";
import {
  convertToWebp as convertToWebpLib,
  convertToWebpOptimized,
  type ConversionResult,
} from "./features/convert/lib/convertToWebp";
import type { OptimizationPreset } from "./features/convert/lib/optimizer";
import { useFrameAnalyzer } from "./features/convert/lib/useFrameAnalyzer";
import { ConversionControls } from "./widgets/conversion/ConversionControls";
import { ResultPanel } from "./widgets/result/ResultPanel";
import { THEME } from "./shared/config/theme";
import { ProgressBar } from "./shared/ui/ProgressBar";
import { SAMPLE_GIF } from "./shared/constants/sample";

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
  const [preset, setPreset] = useState<OptimizationPreset>("balanced");
  const [enableFrameAnalysis, setEnableFrameAnalysis] = useState(true); // 프레임 분석 활성화

  // 프레임 분석 hook
  const frameAnalyzer = useFrameAnalyzer();

  const onToggleSample = () => {
    setOutputUrl(null);
    frameAnalyzer.reset();
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

  // 파일 업로드 시 자동 분석
  useEffect(() => {
    if (inputFile && enableFrameAnalysis && useOptimizer) {
      frameAnalyzer.analyze(inputFile);
    }
  }, [inputFile, enableFrameAnalysis, useOptimizer]);

  const handleConvert = async () => {
    if (!ffmpeg) return;
    setOutputUrl(null);
    setConvertedSize(null);
    resetProgress();

    try {
      let result: ConversionResult | null = null;

      if (isSample) {
        const res = await fetch(SAMPLE_GIF);
        const blob = await res.blob();
        setOriginalSize(blob.size / 1024);

        // 샘플 파일도 분석 (활성화된 경우)
        let analysisResult = frameAnalyzer.result;
        if (enableFrameAnalysis && useOptimizer && !analysisResult) {
          await frameAnalyzer.analyze(blob);
          analysisResult = frameAnalyzer.result;
        }

        if (useOptimizer) {
          result = await convertToWebpOptimized({
            ffmpeg,
            input: SAMPLE_GIF,
            preset,
            analysis: analysisResult,
            progressCallback: (prog, msg) => {
              setProgress(prog);
              setLoadingMessage(msg);
            },
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

        // 분석 결과 사용
        const analysisResult =
          enableFrameAnalysis && useOptimizer ? frameAnalyzer.result : undefined;

        if (useOptimizer) {
          result = await convertToWebpOptimized({
            ffmpeg,
            input: inputFile,
            preset,
            analysis: analysisResult,
            progressCallback: (prog, msg) => {
              setProgress(prog);
              setLoadingMessage(msg);
            },
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

      {/* 최적화 모드 설정 */}
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
            marginBottom: useOptimizer ? 12 : 0,
          }}
        >
          <input
            type="checkbox"
            checked={useOptimizer}
            onChange={(e) => setUseOptimizer(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>
            자동 최적화 모드
          </span>
        </label>

        {useOptimizer && (
          <div style={{ marginTop: 12 }}>
            <label
              style={{
                fontSize: "0.9rem",
                fontWeight: 500,
                color: "#333",
                display: "block",
                marginBottom: 8,
              }}
            >
              프리셋 선택
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <PresetButton
                active={preset === "high-quality"}
                onClick={() => setPreset("high-quality")}
                label="고품질"
                description="Q90 · 최고 화질"
              />
              <PresetButton
                active={preset === "balanced"}
                onClick={() => setPreset("balanced")}
                label="밸런스"
                description="Q85 · 권장"
              />
              <PresetButton
                active={preset === "compressed"}
                onClick={() => setPreset("compressed")}
                label="압축"
                description="Q75 · 최소 용량"
              />
            </div>

            {/* 프레임 분석 옵션 */}
            <div style={{ marginTop: 16 }}>
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
                  checked={enableFrameAnalysis}
                  onChange={(e) => setEnableFrameAnalysis(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                  프레임 중복 제거 (Web Worker)
                </span>
              </label>
              <p
                style={{
                  marginTop: 8,
                  fontSize: "0.85rem",
                  color: "#666",
                  lineHeight: 1.5,
                }}
              >
                백그라운드에서 중복 프레임을 분석하여 용량을 추가로 절감합니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 프레임 분석 진행률 */}
      {frameAnalyzer.analyzing && frameAnalyzer.progress && (
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
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>
              프레임 분석 중...
            </span>
          </div>
          <ProgressBar
            progress={frameAnalyzer.progress.progress}
            theme={THEME}
            message={frameAnalyzer.progress.message}
          />
        </div>
      )}

      {/* 분석 결과 표시 */}
      {frameAnalyzer.result && !frameAnalyzer.analyzing && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            backgroundColor: "#f0fdf4",
            borderRadius: 8,
            border: "1px solid #86efac",
            maxWidth: 600,
            width: "100%",
          }}
        >
          <h3
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              marginBottom: 12,
              color: "#16a34a",
            }}
          >
            ✓ 분석 완료
          </h3>
          <div style={{ fontSize: "0.85rem", color: "#166534", lineHeight: 1.8 }}>
            <div>
              총 프레임: {frameAnalyzer.result.totalFrames}개 →{" "}
              {frameAnalyzer.result.uniqueFrames}개 유지
            </div>
            <div>
              중복 제거: {frameAnalyzer.result.duplicateFrames}개 (
              {Math.round((1 - frameAnalyzer.result.compressionRatio) * 100)}%
              감소)
            </div>
            <div>
              해상도: {frameAnalyzer.result.width}×{frameAnalyzer.result.height} ·{" "}
              {frameAnalyzer.result.fps} FPS
            </div>
          </div>
        </div>
      )}

      {/* 변환 진행률 */}
      {progress > 0 && progress < 100 && (
        <ProgressBar
          progress={progress}
          theme={THEME}
          message={loadingMessage}
        />
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

// 프리셋 버튼 컴포넌트
function PresetButton({
  active,
  onClick,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "12px 8px",
        border: active ? `2px solid ${THEME}` : "2px solid #e5e7eb",
        borderRadius: 8,
        backgroundColor: active ? "#fef3e2" : "white",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          fontSize: "0.9rem",
          fontWeight: 600,
          color: active ? THEME : "#333",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "0.75rem", color: "#666" }}>{description}</div>
    </button>
  );
}
