
export default function SploveLoader({ size = 140 }) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <linearGradient id="sploveRed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF3B3B" />
              <stop offset="100%" stopColor="#E11D2E" />
            </linearGradient>
          </defs>
  
          {/* CŒUR */}
          <path
            d="M100 140
            C90 130, 65 110, 55 90
            C45 70, 55 50, 75 50
            C90 50, 100 65, 100 65
            C100 65, 110 50, 125 50
            C145 50, 155 70, 145 90
            C135 110, 110 130, 100 140Z"
            fill="url(#sploveRed)"
          />
  
          {/* ORBITE */}
          <ellipse
            cx="100"
            cy="105"
            rx="65"
            ry="30"
            fill="none"
            stroke="url(#sploveRed)"
            strokeWidth="10"
            transform="rotate(-20 100 105)"
          />
        </svg>
      </div>
    );
  }