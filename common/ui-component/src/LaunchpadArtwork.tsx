import { useId } from 'react'
import './launchpad-artwork.css'

type ArtworkProps = { tool: 'paint' | 'cel' | 'svg' }

function PaintArtwork({ id }: { id: string }) {
  return <>
    <defs>
      <linearGradient id={`${id}-ribbon`} x1="124" y1="196" x2="368" y2="60" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F2AC68" /><stop offset=".45" stopColor="#FF785E" /><stop offset="1" stopColor="#F29ECB" />
      </linearGradient>
      <linearGradient id={`${id}-echo`} x1="206" y1="68" x2="389" y2="239" gradientUnits="userSpaceOnUse">
        <stop stopColor="#9B74B9" /><stop offset="1" stopColor="#D881AB" />
      </linearGradient>
      <linearGradient id={`${id}-tip`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#FFDFB3" /><stop offset="1" stopColor="#F29A6F" />
      </linearGradient>
    </defs>
    <g className="lp-art-guides" stroke="#D6BAC8" strokeWidth="1">
      <path d="M80 68H440M80 224H440" strokeDasharray="2 7" />
      <path d="M100 51V239M415 51V239" strokeDasharray="2 7" />
      <path d="M93 68H107M100 61V75M408 224H422M415 217V231" />
    </g>
    <path d="M158 84C188 34 291 34 337 88C400 162 306 246 235 224C174 205 217 172 281 172" stroke={`url(#${id}-echo)`} strokeWidth="27" strokeLinecap="round" opacity=".78" />
    <path d="M130 197C69 141 174 54 249 77C310 96 246 154 210 171C147 200 278 216 332 174C380 137 393 85 363 65" stroke="#18151F" strokeWidth="47" strokeLinecap="round" opacity=".22" transform="translate(0 8)" />
    <path d="M130 197C69 141 174 54 249 77C310 96 246 154 210 171C147 200 278 216 332 174C380 137 393 85 363 65" stroke={`url(#${id}-ribbon)`} strokeWidth="38" strokeLinecap="round" />
    <path d="M121 186C87 145 176 65 242 87M232 181C271 190 312 176 333 154C365 120 375 88 364 74" stroke="#FFE3CE" strokeWidth="3" strokeLinecap="round" opacity=".48" />
    <path d="M134 205C161 219 205 217 234 211M202 160C234 142 281 104 254 90" stroke="#9D4960" strokeWidth="2" strokeLinecap="round" opacity=".37" />
    <g className="lp-art-sparkles" fill="#F5CA99">
      <circle cx="104" cy="112" r="3" /><circle cx="406" cy="132" r="3.5" /><circle cx="378" cy="200" r="2.5" />
      <circle cx="164" cy="43" r="2" /><circle cx="304" cy="42" r="2" /><circle cx="105" cy="212" r="1.5" />
      <path d="M410 74L412 80L418 82L412 84L410 90L408 84L402 82L408 80Z" />
    </g>
    <g transform="translate(333 237) rotate(-10)">
      <rect width="111" height="35" rx="17.5" fill="#26212C" stroke="#FBD9CF" strokeOpacity=".14" />
      <circle cx="21" cy="17.5" r="9" fill="#F8B776" /><circle cx="44" cy="17.5" r="9" fill="#FF7A6B" />
      <circle cx="67" cy="17.5" r="9" fill="#DE98BD" /><circle cx="90" cy="17.5" r="9" fill="#AD92CA" />
      <circle cx="21" cy="17.5" r="12" stroke="#F8B776" strokeOpacity=".45" />
    </g>
    <g transform="translate(70 242)">
      <rect width="183" height="29" rx="7" fill="#24212B" stroke="#F5CBCD" strokeOpacity=".14" />
      <path d="M15 10L22 14.5L15 19Z" fill="#F2B69E" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map(index => <rect key={index} x={36 + index * 16} y="9" width="12" height="11" rx="2" fill="#E7A88F" opacity={index === 4 ? .88 : .14 + index * .035} />)}
      <path d="M107 3V26" stroke="#F7C594" strokeWidth="1.5" />
      <path d="M104 3H110L107 7Z" fill="#F7C594" />
    </g>
    <g transform="translate(421 169) rotate(35)">
      <path d="M0 0L5 11L0 31L-5 11Z" fill={`url(#${id}-tip)`} />
      <path d="M-5 11H5M0 0V11" stroke="#754B49" strokeWidth="1.2" />
      <rect x="-4" y="31" width="8" height="31" rx="3" fill="#B399B5" />
    </g>
  </>
}

function VectorArtwork({ id }: { id: string }) {
  const petal = 'M268 147C224 142 201 97 221 63C237 35 274 45 286 73C297 103 284 131 268 147Z'
  return <>
    <defs>
      <linearGradient id={`${id}-petal`} x1="213" y1="45" x2="282" y2="155" gradientUnits="userSpaceOnUse">
        <stop stopColor="#B6BAFF" /><stop offset=".53" stopColor="#9695EC" /><stop offset="1" stopColor="#686ACA" />
      </linearGradient>
      <linearGradient id={`${id}-mint`} x1="220" y1="53" x2="280" y2="152" gradientUnits="userSpaceOnUse">
        <stop stopColor="#BCF3D9" /><stop offset="1" stopColor="#6FC4BD" />
      </linearGradient>
      <pattern id={`${id}-grid`} x="4" y="3" width="23" height="23" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r=".85" fill="#C1C7F4" opacity=".19" />
      </pattern>
    </defs>
    <rect x="65" y="22" width="391" height="253" fill={`url(#${id}-grid)`} />
    <g opacity=".26" stroke="#B5B7EF" strokeWidth=".7">
      <circle cx="268" cy="147" r="103" /><circle cx="268" cy="147" r="52" />
      <path d="M130 147H406M268 18V276" strokeDasharray="3 6" />
    </g>
    <g className="lp-art-vector-form">
      {[0, 60, 120, 180, 240, 300].map((rotation, index) => <path key={rotation} d={petal} transform={`rotate(${rotation} 268 147)`}
        fill={`url(#${id}-${index === 1 || index === 4 ? 'mint' : 'petal'})`} stroke="#DDDDFF" strokeOpacity=".16" strokeWidth=".8" />)}
      <circle cx="268" cy="147" r="12" fill="#202637" /><circle cx="268" cy="147" r="5" fill="#D0ECD9" />
    </g>
    <g stroke="#D2D4FF" strokeWidth="1" opacity=".72">
      <rect x="159" y="36" width="218" height="221" rx="1" strokeDasharray="4 4" />
      {[[159, 36], [377, 36], [377, 257], [159, 257]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" fill="#242638" />)}
    </g>
    <g className="lp-art-bezier" stroke="#E4FFF2" strokeWidth="1.35">
      <path d={petal} strokeWidth="1.65" />
      <path d="M221 63L201 97M221 63L237 35M268 147L224 142M268 147L284 131" opacity=".86" />
      <circle cx="201" cy="97" r="3" fill="#272C3D" /><circle cx="237" cy="35" r="3" fill="#272C3D" />
      <circle cx="224" cy="142" r="3" fill="#272C3D" /><circle cx="284" cy="131" r="3" fill="#272C3D" />
      <rect x="217.5" y="59.5" width="7" height="7" fill="#C0F0DB" /><rect x="264.5" y="143.5" width="7" height="7" fill="#C0F0DB" />
    </g>
    <g transform="translate(388 200) rotate(8)">
      <rect width="62" height="58" rx="12" fill="#282B3D" stroke="#C6C9FF" strokeOpacity=".21" />
      <path d="M18 37L30 16L43 37Z" stroke="#B6BCF6" strokeWidth="1.5" />
      <circle cx="30" cy="16" r="3" fill="#BEEBD7" /><circle cx="18" cy="37" r="3" fill="#BEEBD7" /><circle cx="43" cy="37" r="3" fill="#BEEBD7" />
    </g>
    <g transform="translate(93 171) rotate(-10)">
      <rect width="48" height="48" rx="12" fill="#282B3D" stroke="#C6C9FF" strokeOpacity=".19" />
      <circle cx="24" cy="24" r="12" stroke="#B7B5FA" strokeWidth="7" />
      <path d="M15 33L33 15" stroke="#CAEFDF" strokeWidth="2" />
    </g>
    <path d="M345 77L344 105L351 99L358 111L364 107L357 96L367 93Z" fill="#E7E8FF" stroke="#282B3E" strokeWidth="2" strokeLinejoin="round" />
  </>
}

function CelArtwork({ id }: { id: string }) {
  const star = 'M0 -66C7 -66 15 -36 24 -31C33 -25 63 -28 66 -20C70 -11 45 6 42 16C39 27 51 54 43 59C36 65 11 46 0 46C-11 46 -36 65 -43 59C-51 54 -39 27 -42 16C-45 6 -70 -11 -66 -20C-63 -28 -33 -25 -24 -31C-15 -36 -7 -66 0 -66Z'
  return <>
    <defs>
      <linearGradient id={`${id}-star`} x1="-45" y1="-48" x2="47" y2="56" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFDE8B" /><stop offset="1" stopColor="#F3AC70" />
      </linearGradient>
      <pattern id={`${id}-paper`} width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r=".65" fill="#7C7679" opacity=".19" />
      </pattern>
    </defs>
    <g stroke="#B7ADB3" strokeWidth="1" opacity=".25">
      <path d="M92 47H430M92 254H430" strokeDasharray="2 7" />
      <path d="M86 56V44H98M424 259H436V247" />
    </g>
    <g transform="translate(96 50) rotate(-12 105 109)">
      <rect x="3" y="8" width="210" height="217" rx="13" fill="#171B22" opacity=".35" />
      <rect width="210" height="217" rx="13" fill="#CBC7C2" />
      <rect x="11" y="11" width="188" height="172" rx="6" fill="#E4DFD5" />
      <rect x="11" y="11" width="188" height="172" rx="6" fill={`url(#${id}-paper)`} />
      <g transform="translate(103 100) scale(.88)" stroke="#777D83" strokeWidth="1.5" opacity=".8">
        <path d={star} transform="rotate(-5)" />
        <path d={star} transform="translate(3 1) rotate(-3)" strokeWidth=".7" opacity=".6" />
        <ellipse cx="0" cy="1" rx="48" ry="47" strokeDasharray="4 4" opacity=".4" />
        <path d="M-52 0H53M0 -68V64" strokeDasharray="3 5" opacity=".3" />
        <path d="M-21 -4Q-17 -15 -12 -3M12 -4Q17 -15 22 -3M-11 17Q0 29 12 16" strokeLinecap="round" />
        <path d="M-41 -35L-29 -44M42 45L52 37M-61 29L-50 24" strokeWidth=".8" opacity=".6" />
      </g>
      <circle cx="21" cy="201" r="3" fill="#7E8185" /><path d="M33 201H79" stroke="#909193" strokeWidth="3" strokeLinecap="round" />
      <path d="M173 197L178 201L173 205M182 197L187 201L182 205" stroke="#8D8D8E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <g transform="translate(226 37) rotate(7 105 110)">
      <rect x="4" y="9" width="210" height="222" rx="13" fill="#141B20" opacity=".36" />
      <rect width="210" height="222" rx="13" fill="#FAF0DB" />
      <rect x="10" y="10" width="190" height="178" rx="7" fill="#B9D9CE" />
      <path d="M11 146C68 115 125 168 199 137V181Q199 188 192 188H18Q11 188 11 181Z" fill="#A4C8BF" />
      <g transform="translate(105 102) rotate(-9)">
        <ellipse cx="4" cy="66" rx="45" ry="7" fill="#5D9E92" opacity=".29" />
        <path d={star} fill={`url(#${id}-star)`} stroke="#51464A" strokeWidth="3.3" strokeLinejoin="round" />
        <path d="M-18 -35C-10 -43 -7 -58 -2 -59M-50 -20C-39 -21 -32 -23 -27 -26" stroke="#FFF0C6" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="-17" cy="-4" rx="4" ry="7" fill="#51464A" /><ellipse cx="17" cy="-4" rx="4" ry="7" fill="#51464A" />
        <circle cx="-18" cy="-6" r="1.2" fill="#FFF8EB" /><circle cx="16" cy="-6" r="1.2" fill="#FFF8EB" />
        <ellipse cx="-29" cy="10" rx="7" ry="4" fill="#E18A79" opacity=".75" /><ellipse cx="29" cy="10" rx="7" ry="4" fill="#E18A79" opacity=".75" />
        <path d="M-11 16Q0 29 11 16" stroke="#51464A" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g fill="#FAF1CE" className="lp-art-sparkles">
        <path d="M32 34L35 41L42 44L35 47L32 54L29 47L22 44L29 41Z" />
        <path d="M173 102L175 107L180 109L175 111L173 116L171 111L166 109L171 107Z" />
        <circle cx="167" cy="31" r="2" /><circle cx="39" cy="150" r="2.5" />
      </g>
      <circle cx="21" cy="205" r="3" fill="#698F84" /><path d="M33 205H79" stroke="#A9B5A7" strokeWidth="3" strokeLinecap="round" />
      <rect x="160" y="198" width="31" height="14" rx="7" fill="#DFE9DD" />
      <path d="M170 205L174 208L181 202" stroke="#658D7B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <g transform="translate(80 228) rotate(-6)">
      <rect width="86" height="33" rx="16.5" fill="#293134" stroke="#B9D7CC" strokeOpacity=".25" />
      <path d="M17 22L20 12L24 10L28 14L25 18Z" fill="#F0C796" />
      <path d="M38 16.5H48M44 12.5L48 16.5L44 20.5" stroke="#B7C9C0" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M64 10L66 14L70 16L66 18L64 22L62 18L58 16L62 14Z" fill="#C1E6CF" />
    </g>
  </>
}

/** Decorative, resolution-independent artwork for the creative tool launchers. */
export function LaunchpadArtwork({ tool }: ArtworkProps) {
  const id = `lp-art-${useId().replace(/:/g, '')}`
  return <div className={`lp-art lp-art-${tool}`} aria-hidden="true">
    <svg viewBox="0 0 520 300" fill="none" focusable="false">
      {tool === 'paint' ? <PaintArtwork id={id} /> : tool === 'svg' ? <VectorArtwork id={id} /> : <CelArtwork id={id} />}
    </svg>
  </div>
}
