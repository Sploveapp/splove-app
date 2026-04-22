export default function TestLogo() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#0B0B0F",
      }}
    >
      <svg viewBox="0 0 200 200" width="200" role="img" aria-label="Logo anime coeur et orbite">
        <path d="M100 170 L40 90 A30 30 0 0 1 100 50 A30 30 0 0 1 160 90 Z" fill="#FF2A3D" />

        <g
          style={{
            transformOrigin: "100px 100px",
            animation: "spin 4s linear infinite",
          }}
        >
          <ellipse cx="100" cy="110" rx="90" ry="40" fill="none" stroke="#FF2A3D" strokeWidth="8" />
        </g>
      </svg>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
