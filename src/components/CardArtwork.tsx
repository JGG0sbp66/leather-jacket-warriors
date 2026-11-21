import { useId } from 'react';
import type { ReactNode } from 'react';
import type { HexId, WeaponId } from '../types/game.ts';

function CardFrame({ uid, className, children }: { uid: string; className: string; children: ReactNode }) {
  return <svg className={`card-artwork ${className}`} viewBox="0 0 320 240" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2=".8" y2="1">
        <stop stopColor="#81999c"/><stop offset=".24" stopColor="#34494e"/><stop offset=".64" stopColor="#17272e"/><stop offset="1" stopColor="#09151b"/>
      </linearGradient>
      <linearGradient id={`${uid}-steel`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#f1fcf2"/><stop offset=".38" stopColor="#c1d1cc"/><stop offset=".56" stopColor="#71868a"/><stop offset="1" stopColor="#d9e9df"/>
      </linearGradient>
      <linearGradient id={`${uid}-energy`} x1="0" y1="1" x2="1" y2="0">
        <stop stopColor="currentColor" stopOpacity=".1"/><stop offset=".55" stopColor="currentColor" stopOpacity=".5"/><stop offset="1" stopColor="#eaffed"/>
      </linearGradient>
      <radialGradient id={`${uid}-halo`}>
        <stop stopColor="currentColor" stopOpacity=".18"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/>
      </radialGradient>
      <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <ellipse cx="160" cy="130" rx="144" ry="104" fill={`url(#${uid}-halo)`}/>
    <g stroke="currentColor" fill="none" opacity=".12">
      <path d="M24 177h34l18 18h44m176-26h-27l-19 26h-41M37 66h25l14-14h30m184 24h-30l-12-12h-29"/>
      <ellipse cx="160" cy="211" rx="113" ry="15"/><ellipse cx="160" cy="211" rx="83" ry="9"/>
      <path d="M30 100v19m-9-10h18m238 30v18m-9-9h18"/>
    </g>
    <ellipse cx="160" cy="212" rx="80" ry="10" fill="#030c0c" opacity=".65"/>
    {children}
    <g fill="currentColor" opacity=".6"><circle cx="46" cy="147" r="1.5"/><circle cx="272" cy="92" r="2"/><circle cx="233" cy="37" r="1"/><circle cx="88" cy="208" r="1.5"/></g>
  </svg>;
}

function Fan({ x }: { x: number }) {
  return <g transform={`translate(${x} 112)`}>
    <circle r="34" fill="#071618" stroke="#6e8985" strokeWidth="2"/>
    <circle r="29" fill="none" stroke="currentColor" strokeOpacity=".7"/>
    {Array.from({ length: 7 }, (_, i) => <path key={i} d="M-3-7C-24-15-15-31-5-25L7-10Z" transform={`rotate(${i * 360 / 7})`} fill="#809893" stroke="#adccba" strokeWidth=".6"/>)}
    <circle r="10" fill="#263d3d" stroke="currentColor" strokeWidth="2"/><circle r="4" fill="currentColor"/>
  </g>;
}

function CyberDuck({ x, y, scale = 1, ghost = false }: { x: number; y: number; scale?: number; ghost?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={ghost ? .7 : 1}>
    <path d="M-30 21l-33-9 18 25 27 1m47-8 25-9-9 20-27 2" fill="#617e81" stroke="#b5d9c3" strokeWidth="2"/>
    <path d="M-41 1q-8 46 37 49 36 0 42-30l-9-27-25-6-16 17Z" fill="#354c51" stroke="#a9cbb8" strokeWidth="2"/>
    <path d="M-29 11q-6 30 29 31l17-12-13-14Z" fill="#d8d9a4"/>
    <path d="M-14 8v-31q0-22 23-22 26 0 27 24L27 5 9 19Z" fill="#e7e4ad" stroke="#f8f4cf" strokeWidth="2"/>
    <path d="M-12-29q12-20 38-7l9 13H-13Z" fill="#315354"/>
    <path d="M29-17h18l9 8-28 7Z" fill="#efa754" stroke="#f9d089" strokeWidth="1.5"/>
    <path d="M-6-16h34l-4 9H-7Z" fill="#122c30"/><path d="M4-12h16" stroke="currentColor" strokeWidth="3"/>
    <path d="M-16 26H3l7 9h-29Z" fill="#123735" stroke="currentColor"/>
    <path d="M-20 48v9m37-13 5 9" stroke="#71ead9" strokeWidth="4"/>
    <path d="M-20 61v9m44-10 3 9" stroke="#71ead9" strokeWidth="2" opacity=".5"/>
  </g>;
}

function weaponDrawing(id: WeaponId, uid: string): ReactNode {
  const metal = `url(#${uid}-metal)`;
  const steel = `url(#${uid}-steel)`;
  const energy = `url(#${uid}-energy)`;
  const glow = `url(#${uid}-glow)`;
  switch (id) {
    case 'gpu': return <>
      <g stroke="currentColor" fill="none" strokeLinecap="round"><path d="M30 163 86 146M39 180l72-24M71 194l53-22" strokeWidth="3" opacity=".5"/><path d="m31 198 68-23" opacity=".25"/></g>
      <g transform="rotate(-23 160 122)">
        <path d="M58 74h194v88H58Z" fill="#27634a" stroke="#74b483" strokeWidth="2"/>
        <path d="M67 157h157v14H67Z" fill="#102b26"/>
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${80 + i * 11} 163v13`} stroke="#d9bb72" strokeWidth="6"/>)}
        <path d="M57 75 77 60h167l19 19v66l-14 14H71l-14-12Z" fill={metal} stroke="#a7c8b4" strokeWidth="2"/>
        <path d="M69 78h174M70 145h177" stroke="currentColor" strokeWidth="3"/>
        <Fan x={113}/><Fan x={201}/>
        <path d="M58 76H47v92h14M251 86h14v45h-9" fill="none" stroke="#8a9d94" strokeWidth="6"/>
        <path d="M146 60h25l9 15h-40Z" fill="#2a6d4b" stroke="currentColor"/>
        <circle cx="161" cy="111" r="5" fill="currentColor" filter={glow}/>
        <path d="m73 65 15-3m145 0 10 6M74 154l15 1m138 0 14-1" stroke="#e6f5d5" strokeWidth="2"/>
      </g>
    </>;
    case 'spatula': return <>
      <path d="M66 172C26 93 133 21 266 57 164 40 91 97 96 159Z" fill={energy} opacity=".4"/>
      <path d="M63 156C50 94 140 39 252 53" fill="none" stroke="currentColor" strokeWidth="3" filter={glow}/>
      <g transform="rotate(35 163 127)">
        <path d="M148 94h27v42h-27Z" fill={steel} stroke="#edfff0"/>
        <path d="M113 38q47-17 94 0l-8 54q-38 28-78 0Z" fill={steel} stroke="#d6f5df" strokeWidth="2"/>
        <path d="m121 42 7 39q31 17 63 0l6-39" fill="none" stroke="#effff2" strokeWidth="2"/>
        {[142, 158, 174].map((x) => <path key={x} d={`M${x} 42v36`} stroke="#486569" strokeWidth="6" strokeLinecap="round"/>)}
        <path d="M153 118h17v86q-8 14-17 0Z" fill="#142427" stroke="#849e93" strokeWidth="2"/>
        <path d="M153 143h17m-17 14h17m-17 14h17m-17 14h17" stroke="currentColor" strokeOpacity=".7" strokeWidth="3"/>
        <ellipse cx="161" cy="199" rx="3" ry="5" fill="#010b0b"/>
      </g>
      <path d="m238 96 9-10m-15 26 16-7M71 173l-7 12" stroke="currentColor" strokeWidth="2"/>
    </>;
    case 'cuda': return <>
      <path d="M49 164C45 21 273 21 271 164Z" fill={energy} opacity=".13"/>
      <path d="M49 164C45 21 273 21 271 164M104 172C92 27 228 27 218 172" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.5"/>
      <g fill="none" stroke="currentColor">
        <ellipse cx="160" cy="165" rx="116" ry="40" strokeWidth="4" filter={glow}/>
        <ellipse cx="160" cy="165" rx="93" ry="30" strokeWidth="2" strokeDasharray="20 7"/>
        <ellipse cx="160" cy="157" rx="66" ry="21" strokeWidth="2"/>
        <path d="m66 166 32-5 18 14h33m27 9 22-13h41M97 143l21 9m63-11 33-6M160 195v13" strokeWidth="2"/>
      </g>
      <path d="m121 136 40-22 39 22v26l-39 25-40-25Z" fill={metal} stroke="currentColor" strokeWidth="2"/>
      <path d="m121 136 40 23 39-23m-39 23v28" fill="none" stroke="#caffd8"/>
      <path d="m139 133 22-12 22 12-22 13Z" fill="currentColor" filter={glow}/>
      <path d="M161 113V63" stroke="currentColor" strokeWidth="3" strokeDasharray="3 8"/>
      <path d="m148 55 13-14 13 14-13 14Z" fill={energy} stroke="#e3ffe2"/>
      {[73, 248].map((x) => <g key={x}><path d={`M${x} 147v-40`} stroke="currentColor" strokeWidth="2"/><circle cx={x} cy="101" r="5" fill="currentColor" filter={glow}/></g>)}
    </>;
    case 'pulse': return <>
      <g transform="rotate(-18 158 136)">
        <path d="m79 95 101-9 40 38-23 42-104 5-30-35Z" fill={metal} stroke="#96b9b8" strokeWidth="2"/>
        <path d="m100 164-8 34h34l16-37" fill="#1f323a" stroke="#7d9e9c" strokeWidth="2"/>
        <path d="M93 192h34" stroke="currentColor" strokeWidth="3"/>
        <path d="M98 100v49m12-54v58m12-61v57m12-59v59" stroke="#90a5a5" strokeWidth="4"/>
        {[103, 143].map((y) => <g key={y}>
          <path d={`M146 ${y - 13}h106v26H146Z`} fill={steel} stroke="#bde4dc" strokeWidth="1.5"/>
          <path d={`M155 ${y - 16}v32m15-32v32m15-32v32m15-32v32`} stroke="#314c53" strokeWidth="6"/>
          <path d={`M215 ${y - 16}h37v32h-37Z`} fill="#19343e" stroke="#819b9e" strokeWidth="2"/>
          <ellipse cx="253" cy={y} rx="8" ry="16" fill="#102a33" stroke="currentColor" strokeWidth="3"/>
          <ellipse cx="255" cy={y} rx="3" ry="9" fill="#defffc" filter={glow}/>
          <path d={`M260 ${y}h25`} stroke="currentColor" strokeWidth="4" filter={glow}/>
        </g>)}
        <path d="m64 119-14 5v26l31 8" fill="#405855" stroke="#94b8a7"/>
        <rect x="84" y="116" width="13" height="24" rx="2" fill="currentColor"/>
      </g>
    </>;
    case 'duck': return <>
      <ellipse cx="163" cy="148" rx="116" ry="51" transform="rotate(-14 163 148)" fill="none" stroke="currentColor" strokeOpacity=".4" strokeDasharray="28 9"/>
      <CyberDuck x={224} y={84} scale={.68} ghost/>
      <CyberDuck x={133} y={135} scale={1.18}/>
      <g fill="#b7fff0" filter={glow}><path d="m249 79 29-8-18 14Z"/><path d="m186 134 36-5-27 12Z"/></g>
      <path d="m65 173-15 5m172-137-12 8" stroke="currentColor" strokeWidth="2"/>
    </>;
  }
}

function CoatFigure({ x, ghost = false }: { x: number; ghost?: boolean }) {
  return <g transform={`translate(${x} 39)`} opacity={ghost ? .52 : 1}>
    <path d="m-22 54-26 20-14 81h113L38 75 20 54Z" fill={ghost ? 'currentColor' : '#142327'} stroke={ghost ? '#d6faff' : '#789c9c'} strokeWidth="2"/>
    <path d="M-15 1Q7-10 23 8l4 24-15 22h-27l-12-22Z" fill={ghost ? '#b1f8ee' : '#d1b58c'}/>
    <path d="M-27 13q0-30 31-26 28 2 24 33L13 0-9 3Z" fill="#101e23"/>
    <path d="M-25 20H25v9h-50Z" fill="#08191c"/><path d="M-18 24h11m13 0h12" stroke="currentColor" strokeWidth="2"/>
    <path d="M-21 55-8 92-27 79-10 148m30-93L7 93 28 81 12 148" fill="#2c4246" stroke="#9cbbb2"/>
    <path d="M-5 100v55m-21-50-19 8m71-8 19 8" fill="none" stroke="#608d87"/>
  </g>;
}

function hexDrawing(id: HexId, uid: string): ReactNode {
  const metal = `url(#${uid}-metal)`;
  const steel = `url(#${uid}-steel)`;
  const energy = `url(#${uid}-energy)`;
  const glow = `url(#${uid}-glow)`;
  switch (id) {
    case 'echo': return <>
      <path d="M175 24c-2 41 62 68 62 115a62 62 0 0 1-124 0c0-47 64-79 62-115Z" fill={energy} opacity=".25" stroke="currentColor"/>
      <CoatFigure x={203} ghost/><CoatFigure x={118}/>
      <path d="M164 66h85m-90 24h81m-67 20h87m-95 27h87m-87 20h69" stroke="#ccfff5" strokeOpacity=".45"/>
      <path d="m158 190 15 12 15-12" fill="none" stroke="currentColor" strokeWidth="2"/>
    </>;
    case 'chrono': return <>
      <g fill="none" stroke="currentColor"><circle cx="165" cy="124" r="78" opacity=".4"/><circle cx="165" cy="124" r="68" strokeDasharray="3 13" opacity=".6"/><path d="M166 63v60l38 18" strokeWidth="3" opacity=".3"/></g>
      <g transform="rotate(18 167 121)">
        <path d="M146 41h26v155h-26Z" fill={metal} stroke="#b5c6d2" strokeWidth="2"/>
        {Array.from({ length: 7 }, (_, i) => <g key={i} transform={`translate(160 ${54 + i * 21})`}>
          <path d="m-23-8 12-4h22l12 4-8 13h-31Z" fill={steel} stroke="#e0e9ee"/>
          <path d="M-10-5h20v9h-20Z" fill="currentColor" filter={glow}/>
          <path d="m-23-2-13 6m59-6 13 6" stroke="currentColor" strokeWidth="2"/>
        </g>)}
      </g>
      <path d="M41 79h65M31 107h64m-63 29h51m138 38h69m-65-83h57" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".55"/>
    </>;
    case 'chair': return <>
      <path d="m160 15-95 194h190Z" fill={energy} opacity=".1"/>
      <g transform="translate(2 -5)">
        <path d="m111 159-9 58h12l18-55m65-3 18 58h12l-9-66" fill="#bbc8bd" stroke="#edf7df" strokeWidth="2"/>
        <path d="m108 115-8-52q-2-17 14-20h83q15 2 15 18l-4 70-25 15h-58Z" fill={steel} stroke="#f5f9e7" strokeWidth="3"/>
        <path d="M119 58h10v52h-10zm22-4h10v58h-10zm22 0h10v58h-10zm22 4h10v52h-10z" fill="#263d36"/>
        <path d="m106 140-10-34H85l3 49m120-15 10-34h12l-4 48" fill="none" stroke="#edf4dd" strokeWidth="9" strokeLinejoin="round"/>
        <path d="m97 142 101-3 28 18-30 17-96-5-14-13Z" fill="#e5ead5" stroke="#fcffed" strokeWidth="2"/>
        <path d="m99 170-11 44m125-48 15 48" stroke="#8ba597" strokeWidth="6"/>
        <path d="m103 147 87-3 21 11-100 4Z" fill="#f8f9e9"/>
      </g>
      <g fill="currentColor" stroke="#c6ffe7" filter={glow}><path d="m47 155 21-75 5 19-14 61Z"/><path d="m247 161 18-66 5 22-12 48Z"/></g>
    </>;
    case 'hoard': return <>
      <g transform="rotate(-20 155 126)">
        <path d="M89 61h42v81a28 28 0 0 0 56 0V61h42v81a70 70 0 0 1-140 0Z" fill={metal} stroke="#bacdd0" strokeWidth="2"/>
        <path d="M96 78h28v64a35 35 0 0 0 70 0V78h28" fill="none" stroke="currentColor" strokeWidth="4"/>
        <path d="M89 60h42v37H89Zm98 0h42v37h-42Z" fill={steel} stroke="#dce5dd"/>
        <path d="M93 69h34m64 0h34" stroke="currentColor" strokeWidth="7" filter={glow}/>
      </g>
      <g fill={energy} stroke="#d8ffe7" strokeWidth="1.5"><path d="m70 34 12 16-10 19-14-17Z"/><path d="m149 21 14 17-15 20-13-22Z"/><path d="m219 35 17 15-10 25-20-17Z"/><path d="m264 103 13 15-12 16-13-16Z"/></g>
      <g fill="none" stroke="currentColor" strokeDasharray="4 5" opacity=".6"><path d="M79 62q4 32 35 53m38-59q12 9 12 38m67-23-14 35"/></g>
      <circle cx="65" cy="131" r="12" fill="#aa925b" stroke="#f9df9a" strokeWidth="2"/><path d="M65 122v18m-6-12h10m-10 8h10" stroke="#e8d08b"/>
    </>;
    case 'armor': return <>
      <path d="M160 31 241 64v58q-5 50-81 86-77-38-81-86V64Z" fill={energy} opacity=".25" stroke="currentColor" strokeWidth="3"/>
      <g transform="rotate(-13 160 121)">
        <rect x="106" y="70" width="108" height="106" rx="9" fill={metal} stroke="#c5d0b4" strokeWidth="3"/>
        {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${120 + i * 16} 60v10m0 106v12M94 ${84 + i * 16}h12m108 0h12`} stroke="#d9c384" strokeWidth="6"/>)}
        <rect x="125" y="88" width="70" height="70" rx="3" fill="#24423c" stroke="currentColor" strokeWidth="2"/>
        <path d="m160 99 23 13v23l-23 14-23-14v-23Z" fill={energy} stroke="#edffd6"/>
      </g>
      <path d="m69 78-14 26 16 3-19 31m201-58-17 30 22 7-18 34M93 177l-14 9 19 10" fill="none" stroke="currentColor" strokeWidth="3" filter={glow}/>
    </>;
    case 'parry': return <>
      <path d="M58 167q97 48 211-78" fill="none" stroke="currentColor" strokeWidth="5" opacity=".3"/>
      <path d="m80 190 116-130 21-10-4 26L98 200Z" fill={steel} stroke="#f7f9dc" strokeWidth="2"/>
      <path d="m82 177 27 25m-12-4-27 26-15-15 25-25" fill="#24353b" stroke="#d5b66e" strokeWidth="5"/>
      <path d="m106 175 100-113" stroke="#fff7da" strokeWidth="2"/>
      <path d="m258 60-48 44" stroke="#eb907e" strokeWidth="5" strokeLinecap="round"/>
      <path d="m211 105 65 21-19-16m19 16-23 8" fill="none" stroke="currentColor" strokeWidth="4"/>
      <path d="m190 103-24-16 13 27-27 8 34 5-5 29 22-27 22 17-7-28 30-15-31-1 3-28-19 20Z" fill="#fff0b0" filter={glow}/>
      <g stroke="#ffe8a1" strokeWidth="2"><path d="m153 83-13-11m87 79 14 13m-24-83 4-18m-71 77-11 8"/></g>
    </>;
    case 'reckless': return <>
      <path d="M143 43 80 71v53q6 39 59 69l-5-57 20-17-21-34Z" fill={metal} stroke="#e0ba70" strokeWidth="3"/>
      <path d="m173 43 67 28v53q-9 38-60 69l-5-45 19-34-20-17Z" fill={metal} stroke="#e0ba70" strokeWidth="3"/>
      <path d="m141 43 14 40-13 29 20 18-12 40 19 28" fill="none" stroke="#ffc26d" strokeWidth="3"/>
      <path d="m74 96-20-10 4 28Zm182 37 14 9-20 13Zm-125 73-9 17-12-24Z" fill="#c2a270"/>
      <path d="m55 178 190-133-19 40-159 105Z" fill={energy} stroke="#e7ffdd" strokeWidth="1.5" filter={glow}/>
      <path d="m247 42-5 40-16-20-23-4Z" fill="#d7ffb8"/>
      <path d="M58 198 88 180m148-51 28-11" stroke="currentColor" strokeWidth="2"/>
    </>;
    case 'vampire': return <>
      <g fill="none" stroke="currentColor" strokeWidth="2" opacity=".75"><path d="M45 81h35l23 33h20m153-42h-42l-20 44h-14M57 164h36l17-20m155 24h-38l-17-29M160 189v22"/></g>
      <path d="M160 184c-23-21-78-49-76-84 2-39 51-51 76-16 25-35 74-23 76 16 2 35-52 63-76 84Z" fill="#792a39" stroke="#f39ba4" strokeWidth="3"/>
      <path d="M160 174c-7-40-27-54-27-71 0-17 15-31 27-40 12 9 27 23 27 40 0 17-20 31-27 71Z" fill="#df6672"/>
      <path d="M111 124h27l10-20 16 38 10-18h38" fill="none" stroke="#d6ffe5" strokeWidth="3" filter={glow}/>
      {[{ x: 45, y: 81 }, { x: 276, y: 72 }, { x: 58, y: 164 }].map(({ x, y }) => <g key={x + y}><rect x={x - 8} y={y - 8} width="16" height="16" rx="3" fill="#23473c" stroke="currentColor"/><circle cx={x} cy={y} r="3" fill="currentColor"/></g>)}
    </>;
    case 'overwork': return <>
      <circle cx="221" cy="71" r="38" fill="#16292c" stroke="currentColor" strokeWidth="3"/>
      <path d="M221 42v30l20 10" fill="none" stroke="#eaffec" strokeWidth="3"/>
      <path d="M204 25h32m23 15 7-7" stroke="#b7c8bd" strokeWidth="5"/>
      <g transform="rotate(-12 141 141)">
        <path d="m85 78 120 3 17 112-137 7-15-93Z" fill={metal} stroke="#9fbbb4" strokeWidth="2"/>
        <rect x="100" y="93" width="89" height="85" rx="5" fill="#203b36" stroke="currentColor" strokeWidth="2"/>
        <path d="M90 97H76m15 19H76m15 19H76m15 19H76m26 34v16m20-16v16m20-16v16m20-16v16" stroke="#b9ae7d" strokeWidth="5"/>
        <path d="M120 118h15v17h-15v-17m15 17v18m15-35h15v17h-15v-17m15 17v18m17-35h-15v35h15v-18h-15" transform="translate(-5 0)" fill="none" stroke="currentColor" strokeWidth="3"/>
      </g>
      <path d="m104 58-4-22m25 19 4-29m19 34 10-22m64 124 40-13m-32 32 33-5" stroke="#f2bb7c" strokeWidth="3" opacity=".75"/>
    </>;
    case 'wide': return <>
      <path d="M43 65q117 25 234 0v103q-117-25-234 0Z" fill={metal} stroke="#b3cbd0" strokeWidth="3"/>
      <path d="M53 77q107 22 214 0v77q-107-20-214 0Z" fill="#102b2d" stroke="currentColor"/>
      <path d="M55 115q55-8 106 3 60 17 104-4v34q-108-16-210 1Z" fill={energy} opacity=".7"/>
      <path d="m59 135 31-11 28 7 30-27 28 19 37-24 45 5" stroke="currentColor" strokeWidth="3" fill="none" filter={glow}/>
      <path d="M148 159v33l-35 14h94l-35-14v-33" fill={steel} stroke="#bbccc4" strokeWidth="2"/>
      <path d="M34 115H12l11-11m-11 11 11 11m263-11h22l-11-11m11 11-11 11" fill="none" stroke="currentColor" strokeWidth="2"/>
      <path d="M64 187q98-27 194 0" fill="none" stroke="currentColor" strokeDasharray="5 7" opacity=".35"/>
    </>;
    case 'network': return <>
      <g fill="none" stroke="currentColor" strokeWidth="2" opacity=".65"><path d="m54 159 57-61 77 45 61-82M54 159l80 32 54-48 67 46M111 98l18-53 120 16m-61 82-59-98"/></g>
      <path d="M54 159q90 86 201 30" fill="none" stroke="currentColor" strokeWidth="5" opacity=".25"/>
      <circle cx="54" cy="159" r="12" fill="#446256" stroke="#daffe1"/>
      <circle cx="111" cy="98" r="21" fill="#345952" stroke="currentColor" strokeWidth="2"/>
      <circle cx="188" cy="143" r="39" fill={energy} stroke="#d6ffe2" strokeWidth="2" filter={glow}/>
      <path d="m186 117-17 29h18l-2 24 24-34h-19l9-19Z" fill="#eeffda"/>
      {[{ x: 129, y: 45 }, { x: 249, y: 61 }, { x: 255, y: 189 }, { x: 134, y: 191 }].map(({ x, y }) => <g key={x} transform={`translate(${x} ${y})`}><circle r="17" fill="#172d2c" stroke="currentColor"/><circle cy="-5" r="5" fill="#cce3c0"/><path d="M-9 10v-2q9-13 18 0v2Z" fill="#799b88"/></g>)}
    </>;
  }
}

export function WeaponArtwork({ id }: { id: WeaponId }) {
  const uid = useId();
  return <CardFrame uid={uid} className="weapon-artwork">{weaponDrawing(id, uid)}</CardFrame>;
}

export function HexArtwork({ id }: { id: HexId }) {
  const uid = useId();
  return <CardFrame uid={uid} className="hex-artwork">{hexDrawing(id, uid)}</CardFrame>;
}
