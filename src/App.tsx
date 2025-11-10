import { useEffect, useMemo, useState } from "react";
import { useFFmpeg } from "./shared/lib/useFFmpeg";
import { convertToWebp as convertToWebpLib } from "./features/convert/lib/convertToWebp";
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
    resetProgress();
    if (isSample) {
      const res = await fetch(SAMPLE_GIF);
      const blob = await res.blob();
      setOriginalSize(blob.size / 1024);
      const result = await convertToWebpLib({
        ffmpeg,
        input: SAMPLE_GIF,
        quality,
        compression,
      });
      if (result) {
        setOutputUrl(result.url);
        setOutputFileName(result.outputName);
        setConvertedSize(result.sizeKB);
        setProgress(100);
        setLoadingMessage("");
      }
    } else if (inputFile) {
      setOriginalSize(inputFile.size / 1024);
      const result = await convertToWebpLib({
        ffmpeg,
        input: inputFile,
        quality,
        compression,
      });
      if (result) {
        setOutputUrl(result.url);
        setOutputFileName(result.outputName);
        setConvertedSize(result.sizeKB);
        setProgress(100);
        setLoadingMessage("");
      }
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

      {/* 진행률 */}
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
