import { useEffect, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export default function App() {
  const THEME = "#05bcc6";

  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const [ready, setReady] = useState(false);
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputFileName, setOutputFileName] =
    useState<string>("converted.webp");
  const [isSample, setIsSample] = useState(false);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState(80);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [convertedSize, setConvertedSize] = useState<number | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("");

  // 💡 진행 단계별 메시지
  const loadingMessages = [
    "🔍 GIF 파일을 메모리로 로드하고 있어요...",
    "📊 프레임 정보를 분석하는 중이에요...",
    "🎞 프레임을 추출하고 순서를 정리하고 있어요...",
    "🎨 색상 팔레트를 최적화하는 중이에요...",
    "⚙️ 프레임을 WebP 포맷으로 인코딩하고 있어요...",
    "💾 변환된 데이터를 저장하는 중이에요...",
    "🧠 압축 품질과 파일 크기를 계산하고 있어요...",
  ];

  // ✅ FFmpeg 초기화
  useEffect(() => {
    (async () => {
      const ff = new FFmpeg();
      ff.on("progress", ({ progress }) => {
        const percent = Math.round(progress * 100);
        setProgress(percent);

        // 100%를 7등분해서 문구 갱신
        const step = Math.floor(percent / (100 / loadingMessages.length));
        if (step >= 0 && step < loadingMessages.length) {
          setLoadingMessage(loadingMessages[step]);
        }
      });
      await ff.load();
      setFfmpeg(ff);
      setReady(true);
      console.log("✅ FFmpeg ready");
    })().catch(console.error);
  }, []);

  // ✅ 변환 공통 함수
  const convertToWebp = async (input: File | string) => {
    if (!ffmpeg) return;
    setOutputUrl(null);
    setProgress(0);
    setConvertedSize(null);

    // ✅ 파일명 자동 처리
    let baseName = "converted";
    if (typeof input !== "string" && input instanceof File) {
      baseName = input.name.replace(/\.[^/.]+$/, ""); // 확장자 제거
    } else if (typeof input === "string" && input.includes("/")) {
      baseName =
        input
          .split("/")
          .pop()
          ?.replace(/\.[^/.]+$/, "") || "sample";
    }

    const inputName = "input.gif";
    const outputName = `${baseName}.webp`;
    setOutputFileName(outputName);

    await ffmpeg.writeFile(inputName, await fetchFile(input));
    console.log(`🎞 ${baseName}.gif → ${outputName} 변환 중...`);

    await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      "fps=20,scale=iw:-1:flags=lanczos,format=rgba,colorlevels=rimin=0:gimin=0:bimin=0:rimax=1:gimax=1:bimax=1",
      "-c:v",
      "libwebp",
      "-q:v",
      String(quality ?? 80),
      "-compression_level",
      "4",
      "-preset",
      "photo",
      "-pix_fmt",
      "rgba",
      "-loop",
      "0",
      "-an",
      "-vsync",
      "0",
      outputName,
    ]);

    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    const blob = new Blob([data], { type: "image/webp" });
    const url = URL.createObjectURL(blob);
    setOutputUrl(url);
    setProgress(100);
    setLoadingMessage("");

    const convertedKB = blob.size / 1024;
    setConvertedSize(convertedKB);
  };

  const handleConvert = async () => {
    if (!ffmpeg) return;
    setOutputUrl(null);
    if (isSample) {
      const res = await fetch("/sample.gif");
      const blob = await res.blob();
      setOriginalSize(blob.size / 1024);
      await convertToWebp("/sample.gif");
    } else if (inputFile) {
      setOriginalSize(inputFile.size / 1024);
      await convertToWebp(inputFile);
    }
  };

  const handleAddPortfolio = () => {
    alert("✅ 포트폴리오에 추가되었습니다!");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "#fafafa",
        fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
        color: "#111",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "60px 20px",
      }}
    >
      <h1
        style={{
          fontWeight: 600,
          fontSize: 26,
          marginBottom: 40,
          color: THEME,
        }}
      >
        🎬 GIF → WebP 변환기
      </h1>

      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 40,
          width: 480,
          boxSizing: "border-box",
          transition: "all 0.2s ease",
        }}
      >
        {!ready ? (
          <p style={{ textAlign: "center", color: "#999" }}>
            ⚙️ FFmpeg WASM 로딩 중...
          </p>
        ) : (
          <>
            {/* 파일 입력 */}
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
                    setIsSample(false);
                    setOutputUrl(null);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 12px",
                    border: `1px solid ${THEME}33`,
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

            {/* 품질 슬라이더 */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontSize: 14,
                  color: "#555",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                압축 강도 (품질) : {quality}
              </label>
              <input
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                style={{
                  width: "100%",
                  accentColor: THEME,
                  cursor: "pointer",
                }}
              />
            </div>

            {/* 버튼 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <button
                onClick={() => {
                  setIsSample((prev) => !prev);
                  setInputFile(null);
                  setOutputUrl(null);
                }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 8,
                  border: isSample ? `2px solid ${THEME}` : "1px solid #ccc",
                  background: isSample ? `${THEME}10` : "#fff",
                  color: isSample ? THEME : "#333",
                  fontWeight: 500,
                  marginRight: 8,
                  cursor: "pointer",
                }}
              >
                {isSample ? "샘플 사용 중" : "샘플 사용"}
              </button>

              <button
                onClick={handleConvert}
                disabled={!isSample && !inputFile}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 8,
                  border: `1px solid ${THEME}`,
                  background: isSample || inputFile ? THEME : "#ccc",
                  color: "#fff",
                  fontWeight: 500,
                  cursor: isSample || inputFile ? "pointer" : "not-allowed",
                  transition: "all 0.2s ease",
                }}
              >
                변환하기
              </button>
            </div>

            {/* 진행률 */}
            {progress > 0 && progress < 100 && (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    height: 10,
                    background: "#eee",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      background: THEME,
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
                <p
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    color: "#555",
                    marginTop: 6,
                  }}
                >
                  {progress}% 완료
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: THEME,
                    fontWeight: 500,
                    marginTop: 4,
                  }}
                >
                  {loadingMessage}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* 결과 섹션 */}
      {outputUrl && (
        <div
          style={{
            marginTop: 40,
            width: 900,
            background: "#fff",
            borderRadius: 16,
            padding: 30,
            textAlign: "center",
          }}
        >
          <h3
            style={{
              fontSize: 18,
              marginBottom: 20,
              fontWeight: 500,
              color: THEME,
            }}
          >
            🖼 변환 결과 비교
          </h3>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 20,
            }}
          >
            {/* 원본 */}
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: 15, fontWeight: 500 }}>원본</h4>
              {isSample ? (
                <img
                  src="/sample.gif"
                  alt="original"
                  style={{
                    maxWidth: "100%",
                    borderRadius: 12,
                    marginBottom: 8,
                  }}
                />
              ) : (
                inputFile && (
                  <img
                    src={URL.createObjectURL(inputFile)}
                    alt="original"
                    style={{
                      maxWidth: "100%",
                      borderRadius: 12,
                      marginBottom: 8,
                    }}
                  />
                )
              )}
              {originalSize && (
                <p style={{ fontSize: 13, color: "#777" }}>
                  {originalSize.toFixed(1)} KB
                </p>
              )}
            </div>

            {/* 변환본 */}
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: 15, fontWeight: 500 }}>변환본 (WebP)</h4>
              <img
                src={outputUrl}
                alt="converted"
                style={{
                  maxWidth: "100%",
                  borderRadius: 12,
                  marginBottom: 8,
                }}
              />
              {convertedSize && (
                <p style={{ fontSize: 13, color: "#777" }}>
                  {convertedSize.toFixed(1)} KB
                </p>
              )}
            </div>
          </div>

          {/* 다운로드 & 포트폴리오 버튼 */}
          <div style={{ marginTop: 20 }}>
            <a
              href={outputUrl}
              download={outputFileName}
              style={{
                marginRight: 12,
                display: "inline-block",
                padding: "10px 20px",
                borderRadius: 8,
                border: `1px solid ${THEME}`,
                color: THEME,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              {outputFileName} 다운로드
            </a>
            <button
              onClick={handleAddPortfolio}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: `1px solid ${THEME}`,
                background: THEME,
                color: "#fff",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              📁 포트폴리오에 넣기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
