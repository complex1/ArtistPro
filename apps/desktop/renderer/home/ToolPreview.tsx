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

function AnimeArt() {
  return (
    <Art>
      <defs>
        <linearGradient id="anime-stage" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#303144" /><stop offset="1" stopColor="#181f30" />
        </linearGradient>
      </defs>
      <rect width="240" height="132" fill="url(#anime-stage)" />
      <circle cx="181" cy="30" r="35" fill="#e2b577" opacity=".08" />
      <path d="M0 89 120 71 240 89M0 101H240M42 105 120 72 198 105M85 105 120 72 151 105" fill="none" stroke="#9198b6" strokeWidth=".6" opacity=".25" />
      <ellipse cx="124" cy="100" rx="31" ry="5" fill="#101520" />
      <g stroke="#161b2b" strokeWidth="1.8" strokeLinejoin="round">
        <path d="m116 70-9 25-7 5h15l9-24 7 20 12 3 1-5-8-23z" fill="#596581" />
        <path d="m108 40-17 15-18-4-2 7 21 7 23-15m17-10 14 9 12-21 7 4-12 29-25-12" fill="#f0c3a5" />
        <path d="m112 37-6 12 5 23q13 5 25-2l-2-26-7-9z" fill="#aaa0e0" />
        <path d="m127 36 7 8 2 26q-6 4-11 4l1-24z" fill="#7779b4" stroke="none" />
        <path d="M112 15q7-11 19-5 10 7 2 22-7 10-16 0z" fill="#f0c3a5" />
        <path d="m109 23-2-13 6 2 5-9 5 5 10-3 5 11-1 12-5-10-8 3-3-7-5 9-3-5z" fill="#343449" />
        <path d="m112 36-8 9 9-2m13-7 11 7-9-1" fill="#d3c0ed" />
      </g>
      <path d="m120 26 3 1m7-2 3-1" stroke="#352c40" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M79 30Q112-1 151 19M60 73q22 17 36 3" fill="none" stroke="#e1b373" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
      <g fill="#242b40" stroke="#e1bf87" strokeWidth="1.2">
        <circle cx="92" cy="60" r="3" /><circle cx="149" cy="55" r="3" />
        <circle cx="122" cy="70" r="3" /><circle cx="161" cy="30" r="5" />
      </g>
      <path d="M20 19h13m-13 0v13m200-13h-13m13 0v13M20 89h13m-13 0V76m200 13h-13m13 0V76" fill="none" stroke="#b5bbd1" strokeWidth="1" opacity=".65" />
      <rect y="108" width="240" height="24" fill="#141a27" />
      <path d="M40 112v15m20-15v15m20-15v15m20-15v15m20-15v15m20-15v15m20-15v15m20-15v15m20-15v15" stroke="#2a344b" strokeWidth="1" />
      <path d="m17 115 7 5-7 5z" fill="#c3bfd8" />
      <path d="M43 120h154" stroke="#837fa9" opacity=".4" />
      {[44, 119, 195].map(x => <rect key={x} x={x - 3} y="117" width="6" height="6" transform={`rotate(45 ${x} 120)`} fill="#d9b67c" />)}
      <path d="M119 108v24" stroke="#cec4ec" strokeWidth="1.5" />
    </Art>
  )
}

function ReferenceArt() {
  return (
    <Art>
      <defs>
        <linearGradient id="reference-figure" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f2d4b1" /><stop offset="1" stopColor="#a78061" />
        </linearGradient>
        <linearGradient id="reference-floor" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#3d4749" /><stop offset="1" stopColor="#202b31" />
        </linearGradient>
      </defs>
      <rect width="240" height="132" fill="#26333a" />
      <path d="M0 79 120 62 240 79V132H0Z" fill="url(#reference-floor)" />
      <g stroke="#748384" strokeWidth=".6" opacity=".35">
        <path d="M0 94H240M0 113H240M120 64 10 132M120 64 71 132M120 64 150 132M120 64 222 132" />
      </g>
      <ellipse cx="137" cy="116" rx="46" ry="8" fill="#101b22" opacity=".5" />
      <g stroke="#1b272c" strokeWidth="1.3" strokeLinejoin="round" fill="url(#reference-figure)">
        <path d="m112 82-9 31 8 3 12-30m0-1 13 28 8-3-10-33" />
        <path d="m109 69-3 18 23 1 3-18z" />
        <path d="m105 41-2 26 11 11 13-5 9-30-15-5z" />
        <path d="m104 43-17 14-16-7-4 7 21 11 22-16m23-9 17-7 8-17 7 3-8 22-24 13" />
        <ellipse cx="121" cy="25" rx="10" ry="13" transform="rotate(8 121 25)" />
        <path d="m103 112-9 7q1 5 16 1l1-5m25-3 1 7 15 1q3-4-10-7" />
      </g>
      <g fill="#eabb76" stroke="#fff1d3" strokeWidth=".8">
        <circle cx="109" cy="47" r="2.5" /><circle cx="130" cy="47" r="2.5" />
        <circle cx="87" cy="61" r="2.5" /><circle cx="152" cy="40" r="2.5" />
        <circle cx="116" cy="80" r="3" />
      </g>
      <g fill="none" stroke="#eabb76" strokeWidth="1.1">
        <circle cx="162" cy="20" r="6" /><circle cx="67" cy="53" r="6" />
      </g>
      <path d="M22 22H39M22 22V37M218 22H201M218 22V37M22 110H39M22 110V95M218 110H201M218 110V95" fill="none" stroke="#d5e2dd" opacity=".7" />
      <g transform="translate(184 73)" stroke="#a4b6b1" strokeWidth="1" strokeLinejoin="round">
        <path d="m0 9 16-8 16 8-16 8z" fill="#647b79" />
        <path d="M0 9v20l16 9V17z" fill="#455d60" /><path d="M16 17v21l16-9V9z" fill="#364d55" />
      </g>
    </Art>
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

function DrawingArt() {
  return (
    <Art>
      <defs>
        <linearGradient id="drawing-paper" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#faf4e8" /><stop offset="1" stopColor="#ebe2d3" />
        </linearGradient>
        <linearGradient id="drawing-stroke" x1="0" y1="1" x2="1" y2="0">
          <stop stopColor="#de795e" /><stop offset="1" stopColor="#efad71" />
        </linearGradient>
      </defs>
      <rect width="240" height="132" fill="#24282e" />
      <rect x="28" y="12" width="185" height="111" rx="3" fill="#111" opacity=".25" />
      <rect x="25" y="9" width="185" height="111" rx="3" fill="url(#drawing-paper)" />
      <circle cx="162" cy="39" r="17" fill="#efc879" />
      <path d="M35 99C58 80 62 57 88 59s26 35 50 24 25-23 52-11" fill="none" stroke="#90aba2" strokeWidth="19" strokeLinecap="round" />
      <path d="M44 80C73 103 81 26 112 47s0 74 36 48 33-48 48-36" fill="none" stroke="url(#drawing-stroke)" strokeWidth="14" strokeLinecap="round" />
      <path d="M45 78C75 102 80 24 111 45s0 73 36 47" fill="none" stroke="#f7c39c" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <path d="M189 103l22-68 7 2-22 68-6 7z" fill="#344343" />
      <path d="M189 103l7 2-6 7z" fill="#debca0" />
      <rect x="8" y="25" width="9" height="80" rx="4.5" fill="#171b20" />
      <circle cx="12.5" cy="36" r="3" fill="#e69874" /><circle cx="12.5" cy="49" r="3" fill="#90aba2" /><circle cx="12.5" cy="62" r="3" fill="#efc879" />
    </Art>
  )
}

function TapPilotArt() {
  return (
    <Art>
      <defs>
        <linearGradient id="tappilot-bg" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#171d35" />
          <stop offset="1" stopColor="#2d3f71" />
        </linearGradient>
        <linearGradient id="tappilot-phone" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#5f83ff" />
          <stop offset="1" stopColor="#3956c8" />
        </linearGradient>
      </defs>
      <rect width="240" height="132" fill="url(#tappilot-bg)" />
      <path d="M0 106C39 80 63 122 108 98s75-50 132-15v49H0z" fill="#11172b" opacity=".55" />
      <rect x="24" y="23" width="118" height="73" rx="8" fill="#101625" stroke="#7c91de" strokeWidth="1.5" />
      <rect x="32" y="31" width="102" height="54" rx="4" fill="#202c4d" />
      <path d="M43 44h31M43 54h52M43 64h39" stroke="#8fa5ff" strokeWidth="3" strokeLinecap="round" opacity=".85" />
      <rect x="97" y="41" width="25" height="10" rx="3" fill="#f2c979" />
      <rect x="88" y="58" width="34" height="10" rx="3" fill="#5878eb" />
      <rect x="152" y="13" width="48" height="100" rx="11" fill="#101625" stroke="#9eb1ff" strokeWidth="2" />
      <rect x="158" y="23" width="36" height="72" rx="6" fill="url(#tappilot-phone)" />
      <circle cx="176" cy="103" r="3" fill="#9eb1ff" />
      <g fill="#f7f4ea">
        <rect x="164" y="33" width="10" height="10" rx="2" /><rect x="179" y="33" width="10" height="10" rx="2" />
        <rect x="164" y="48" width="10" height="10" rx="2" /><rect x="179" y="48" width="10" height="10" rx="2" />
      </g>
      <path d="M144 55c7 0 8-15 15-15M144 70c8 0 9 14 15 14" fill="none" stroke="#f2c979" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" />
      <circle cx="144" cy="62" r="4" fill="#f2c979" />
    </Art>
  )
}

const ART: Record<string, () => ReactNode> = {
  'anime-3d': AnimeArt,
  'reference-3d': ReferenceArt,
  'frame-by-frame': () => <Art><rect width="240" height="132" fill="#2d2b24" /><path d="M24 95Q116-33 215 96" fill="none" stroke="#bda579" strokeDasharray="3 5" opacity=".5" />{[0, 1, 2].map(index => <g key={index} transform={`translate(${17 + index * 70} ${index === 1 ? 17 : 30}) rotate(${index === 0 ? -7 : index === 2 ? 7 : 0} 32 41)`}><rect width="65" height="85" rx="4" fill="#f0e6d3" /><path d="M8 67H57" stroke="#b6a78c" /><ellipse cx="32" cy={index === 1 ? 32 : 49} rx="15" ry={index === 1 ? 19 : 14} fill={index === 1 ? '#d6a064' : '#8eab9c'} stroke="#596152" strokeWidth="1.4" /><circle cx="27" cy={index === 1 ? 29 : 47} r="1.5" fill="#424c3e" /><circle cx="38" cy={index === 1 ? 29 : 47} r="1.5" fill="#424c3e" /><path d={`M28 ${index === 1 ? 37 : 54}q5 4 10-1`} stroke="#424c3e" fill="none" /><rect x="8" y="75" width="21" height="2" fill="#b6a78c" /></g>)}</Art>,
  'drawing-canvas': DrawingArt,
  'animated-paint': PaintArt,
  cel: CelArt,
  'svg-tool': SvgArt,
  tappilot: TapPilotArt,
  'live-character': LiveCharacterArt,
}

export function ToolPreview({ toolId }: { toolId: string }) {
  const Preview = ART[toolId]
  if (!Preview) return <span className="home-tool-art is-blank" aria-hidden="true" />
  return <Preview />
}
