import type { ReactNode } from 'react'

const VIEW_BOX = '0 0 240 132'

function Art({ children }: { children: ReactNode }) {
  return (
    <svg
      className="home-tool-art"
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function PaintArt() {
  return (
    <Art>
      <defs>
        <linearGradient id="paint-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#081428" />
          <stop offset="100%" stopColor="#17427c" />
        </linearGradient>
        <linearGradient id="paint-crest" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2f6fd0" />
          <stop offset="55%" stopColor="#bcd6ff" />
          <stop offset="100%" stopColor="#f4f8ff" />
        </linearGradient>
      </defs>
      <rect width="240" height="132" fill="url(#paint-bg)" />
      <path
        d="M-14 104C24 60 58 122 104 82s58-62 104-30 46 34 62 42v42H-14z"
        fill="#0e2c58"
        opacity="0.9"
      />
      <path
        d="M-14 92C22 44 62 112 108 68s62-52 106-22"
        stroke="url(#paint-crest)"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M-8 108C30 66 66 126 112 86s60-44 102-18"
        stroke="#7fb0ff"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M6 120C40 92 74 132 118 104s58-28 102-12"
        stroke="#dce9ff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </Art>
  )
}

type CelPalette = {
  sky: string
  skin: string
  hair: string
  cloth: string
  line: string
}

const CEL_FADED: CelPalette = {
  sky: '#5c513f',
  skin: '#c6ab8d',
  hair: '#6f5f4a',
  cloth: '#8a7a62',
  line: '#4a4034',
}

const CEL_RESTORED: CelPalette = {
  sky: '#1f4f57',
  skin: '#f0c9a6',
  hair: '#2f7f74',
  cloth: '#2f6fbe',
  line: '#123038',
}

function CelFigure({ palette }: { palette: CelPalette }) {
  return (
    <g>
      <rect width="240" height="132" fill={palette.sky} />
      <path
        d="M56 132c0-34 28-52 64-52s64 18 64 52z"
        fill={palette.cloth}
        stroke={palette.line}
        strokeWidth="2"
      />
      <ellipse
        cx="120"
        cy="60"
        rx="34"
        ry="38"
        fill={palette.skin}
        stroke={palette.line}
        strokeWidth="2"
      />
      <path
        d="M86 54c2-28 18-40 34-40s32 12 34 40c-10-12-20-16-34-16s-24 4-34 16z"
        fill={palette.hair}
      />
      <circle cx="107" cy="62" r="4" fill={palette.line} />
      <circle cx="133" cy="62" r="4" fill={palette.line} />
      <path
        d="M111 78c6 5 12 5 18 0"
        stroke={palette.line}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  )
}

function CelArt() {
  return (
    <Art>
      <defs>
        <clipPath id="cel-faded">
          <rect width="120" height="132" />
        </clipPath>
        <clipPath id="cel-restored">
          <rect x="120" width="120" height="132" />
        </clipPath>
      </defs>
      <g clipPath="url(#cel-faded)">
        <CelFigure palette={CEL_FADED} />
        <g stroke="#3a3226" strokeWidth="1" opacity="0.35">
          <path d="M12 0v132M44 0v132M78 0v132M104 0v132" />
        </g>
        <path d="M0 0h120v132H0z" fill="#8d7c5f" opacity="0.16" />
      </g>
      <g clipPath="url(#cel-restored)">
        <CelFigure palette={CEL_RESTORED} />
      </g>
      <path d="M120 0v132" stroke="#f4f6fb" strokeWidth="2" opacity="0.85" />
      <circle cx="120" cy="108" r="13" fill="#f4f6fb" />
      <path
        d="M117 103l-5 5 5 5M123 103l5 5-5 5"
        stroke="#1b1f28"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Art>
  )
}

function SvgArt() {
  return (
    <Art>
      <defs>
        <pattern
          id="svg-grid"
          width="24"
          height="22"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M24 0H0v22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.16"
          />
        </pattern>
      </defs>
      <rect width="240" height="132" fill="var(--canvas-bg)" />
      <rect width="240" height="132" fill="url(#svg-grid)" />
      <path
        d="M14 96C44 96 52 34 88 52s40 62 76 34 44-52 62-58"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g stroke="var(--accent)" strokeWidth="1" opacity="0.55">
        <path d="M88 52l-22 8M164 86l24-12" />
      </g>
      <g fill="var(--accent)">
        <circle cx="14" cy="96" r="3.5" />
        <circle cx="88" cy="52" r="3.5" />
        <circle cx="126" cy="76" r="3" opacity="0.7" />
        <circle cx="164" cy="86" r="3.5" />
        <circle cx="226" cy="28" r="3.5" />
      </g>
      <g fill="var(--panel)" stroke="var(--accent)" strokeWidth="1.5">
        <rect x="63" y="57" width="6" height="6" rx="1" />
        <rect x="185" y="71" width="6" height="6" rx="1" />
      </g>
    </Art>
  )
}

function LiveCharacterArt() {
  return (
    <Art>
      <defs>
        <radialGradient id="live-character-bg"><stop stopColor="#484164" /><stop offset="1" stopColor="#282534" /></radialGradient>
        <pattern id="live-character-grid" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#c5a5ff" opacity=".3" /></pattern>
      </defs>
      <rect width="240" height="132" fill="url(#live-character-bg)" />
      <rect width="240" height="132" fill="url(#live-character-grid)" />
      <ellipse cx="121" cy="123" rx="36" ry="4" fill="#1c1b2b" />
      <g stroke="#232136" strokeWidth="2" strokeLinejoin="round">
        <path d="M108 88l-7 29-6 4h17l9-28m2-2 10 26v4h13l-6-8-4-30" fill="#63638b" />
        <path d="M109 49L89 69l-15-8-4 8 20 12 21-16m22-16 20 14 15-22 7 6-16 29-24-14" fill="#efc0a8" />
        <path d="M113 43c-6 4-8 11-7 24l1 22c10 5 24 4 31-2l-2-25c-1-13-5-19-13-20" fill="#b19cde" />
        <path d="M109 20c-4 12 3 29 13 29 14 0 21-16 17-29z" fill="#f4c5aa" />
        <path d="M108 34c-6-6-7-17 0-22 4-6 15-8 21-4 14-1 20 12 12 23l-3-10c-9 5-16 0-18-4-1 8-9 7-10 6z" fill="#37334c" />
      </g>
      <circle cx="119" cy="32" r="1.5" fill="#37334c" /><circle cx="131" cy="31" r="1.5" fill="#37334c" />
      <path d="M121 39q4 3 7-1" fill="none" stroke="#b66e6e" strokeWidth="1.2" />
      <path d="M121 45l1 17 1 25m-1-25-31 13-18-10m49-3 33 8 16-24m-48 41-18 32m18-32 14 30" stroke="#f3eaff" strokeWidth="1" opacity=".7" fill="none" />
      <g fill="#343048" stroke="#d8c7ff" strokeWidth="1.2"><circle cx="121" cy="45" r="2" /><circle cx="122" cy="62" r="2.5" /><circle cx="123" cy="87" r="2.5" /><circle cx="91" cy="75" r="2.5" /><circle cx="155" cy="70" r="2.5" /></g>
      <g fill="none" stroke="#eec572" strokeWidth="1.2"><circle cx="73" cy="65" r="7" /><circle cx="171" cy="46" r="7" /><rect x="116" y="80" width="14" height="14" rx="2" /></g>
    </Art>
  )
}

const ART: Record<string, () => ReactNode> = {
  'animated-paint': PaintArt,
  cel: CelArt,
  'svg-tool': SvgArt,
  'live-character': LiveCharacterArt,
}

export function ToolPreview({ toolId }: { toolId: string }) {
  const Preview = ART[toolId]
  if (!Preview) return <span className="home-tool-art is-blank" aria-hidden="true" />
  return <Preview />
}
