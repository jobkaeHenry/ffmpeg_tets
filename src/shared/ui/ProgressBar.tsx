export function ProgressBar({ progress, theme, message }: { progress: number; theme: string; message?: string }) {
  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: 420, marginTop: 12 }}>
      <div
        style={{
          height: 8,
          background: "#eee",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: theme,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <p style={{ fontSize: 12, color: "#555", marginTop: 6 }}>{progress}% 완료</p>
      {message ? (
        <p style={{ fontSize: 13, color: theme, fontWeight: 500, marginTop: 4 }}>{message}</p>
      ) : null}
    </div>
  );
}
