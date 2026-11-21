import { useId } from 'react';
import { ALLIES } from '../data/summons.ts';
import type { AllyId } from '../types/game.ts';

const PALETTES = {
  ember: {
    coat: ['#e49b64', '#965237', '#302936'],
    skin: ['#ffe3c5', '#dba17f', '#88564e'],
  },
  aegis: {
    coat: ['#48536a', '#242e44', '#101827'],
    skin: ['#ffedce', '#e6b48a', '#a46653'],
  },
  clock: {
    coat: ['#8b76b2', '#51416f', '#221c38'],
    skin: ['#f8e7d7', '#c7adaf', '#807089'],
  },
  patch: {
    coat: ['#44765b', '#1c4437', '#0b2425'],
    skin: ['#fffef1', '#e3f3e8', '#83aaa0'],
  },
} as const;

export function AllyPortrait({ ally, className = '' }: { ally: AllyId; className?: string }) {
  const id = useId();
  const color = ALLIES[ally].color;
  const palette = PALETTES[ally];
  const paint = {
    coat: `url(#${id}-coat)`,
    skin: `url(#${id}-skin)`,
    metal: `url(#${id}-metal)`,
    signal: `url(#${id}-signal)`,
    aura: `url(#${id}-aura)`,
    wafer: `url(#${id}-wafer)`,
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 380"
      className={`ally-portrait ${className}`}
      aria-hidden={true}
      focusable="false"
      fill="none"
    >
      <defs>
        <linearGradient id={`${id}-coat`} x1="0%" y1="0%" x2="90%" y2="100%">
          <stop stopColor={palette.coat[0]} />
          <stop offset="0.48" stopColor={palette.coat[1]} />
          <stop offset="1" stopColor={palette.coat[2]} />
        </linearGradient>
        <linearGradient id={`${id}-skin`} x1="15%" y1="10%" x2="95%" y2="85%">
          <stop stopColor={palette.skin[0]} />
          <stop offset="0.58" stopColor={palette.skin[1]} />
          <stop offset="1" stopColor={palette.skin[2]} />
        </linearGradient>
        <linearGradient id={`${id}-metal`} x1="0%" y1="0%" x2="80%" y2="100%">
          <stop stopColor="#fff2c5" />
          <stop offset="0.42" stopColor="#e3b760" />
          <stop offset="1" stopColor="#795134" />
        </linearGradient>
        <linearGradient id={`${id}-signal`} x1="0%" y1="0%" x2="90%" y2="100%">
          <stop stopColor="#f5f5e9" />
          <stop offset="0.35" stopColor={color} />
          <stop offset="1" stopColor="#263638" />
        </linearGradient>
        <radialGradient id={`${id}-aura`}>
          <stop stopColor={color} stopOpacity="0.025" />
          <stop offset="0.68" stopColor={color} stopOpacity="0.12" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="380" gradientUnits="userSpaceOnUse">
          <stop offset="0.82" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`${id}-mask`} x="0" y="0" width="320" height="380" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
          <rect width="320" height="380" fill={`url(#${id}-fade)`} />
        </mask>
        {ally === 'clock' && (
          <pattern id={`${id}-wafer`} width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M1 1H11V11H1ZM4 4H8V8H4Z" stroke="#e9ddff" strokeWidth="0.65" fill="none" />
          </pattern>
        )}
      </defs>
      <g mask={`url(#${id}-mask)`} stroke="#111a24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="160" cy="173" r="145" fill={paint.aura} stroke="none" />
        <ellipse cx="160" cy="172" rx="120" ry="139" stroke={color} strokeWidth="0.8" opacity="0.25" />
        <path d="M160 27V36M160 309V318M34 172H43M277 172H286M70 69L77 77M244 267L251 275M70 275L77 267M244 77L251 69M114 38A139 139 0 0 1 140 33M192 307L208 301" stroke={color} strokeWidth="1.3" opacity="0.55" />

        {ally === 'ember' && (
          <>
            <ellipse cx="160" cy="139" rx="145" ry="46" transform="rotate(-29 160 139)" stroke={color} strokeWidth="1.5" opacity="0.68" />
            <path d="M30 199Q69 218 181 157T291 80M47 209L57 205M232 86L240 82" stroke={color} strokeWidth="0.9" opacity="0.38" />
            <g transform="translate(264 70) rotate(32)">
              <path d="M-7 8L-15 19L-13 0L-6-7M7 8L15 19L13 0L6-7" fill="#7a4538" stroke={color} strokeWidth="1.4" />
              <path d="M0-29Q12-18 8 10L0 17L-8 10Q-12-18 0-29Z" fill={paint.signal} />
              <circle cy="-6" r="4" fill="#142431" stroke="#fff0cc" strokeWidth="1.2" />
              <path d="M-4 18L0 37L4 18M-3-18L-4-12" stroke={color} strokeWidth="2" />
            </g>
            <path d="M38 130L48 111L54 130L51 139L43 143L38 137L33 141L35 132ZM44 145L40 156" fill={paint.signal} stroke={color} strokeWidth="1.1" />
            <path d="M116 164L186 164L223 180L243 218L250 284L228 316L246 373L155 358L87 374L94 313L67 278L74 210L91 180Z" fill={paint.coat} />
            <path d="M134 176L181 176L210 289L193 349L134 353L114 284Z" fill="#172735" />
            <path d="M91 179L120 181L113 218L75 230L67 215L77 190Z" fill={paint.coat} />
            <path d="M207 178L228 187L246 219L235 230L207 214L191 188Z" fill={paint.coat} />
            <path d="M118 164L147 186L131 233L103 192Z" fill={paint.signal} />
            <path d="M183 163L169 188L197 229L214 190Z" fill={paint.coat} stroke={color} strokeWidth="1.4" />
            <path d="M83 240L97 260L94 296M222 243L233 260L228 282M112 286L104 346L132 333M202 292L222 347L204 338" stroke="#482f32" strokeWidth="3" />
            <path d="M81 205L102 198M218 200L228 208M96 318L90 356M228 320L239 355M142 233L138 278" stroke={color} strokeWidth="2.2" />
            <path d="M147 213L180 211L189 249L151 254Z" fill="#31434b" stroke="#a47a60" strokeWidth="1.5" />
            <path d="M159 241L167 222L179 239L169 235ZM156 259L185 255" fill={color} stroke={color} strokeWidth="1.1" />
            <path d="M104 285L213 278L215 293L107 300Z" fill="#121f2b" />
            <path d="M154 281L175 280L177 296L155 297Z" fill={paint.metal} />
            <path d="M71 275L91 270L107 289L101 307L90 315L74 304L66 288Z" fill="#273741" />
            <path d="M233 267L247 269L256 285L246 305L231 308L218 296L221 281Z" fill="#273741" />
            <path d="M75 284L88 280L99 290M76 294L87 291L97 300M231 279L242 283L247 291M227 288L237 293L238 301" stroke={color} strokeWidth="1.4" />
            <path d="M146 140L174 141L181 168L161 188L140 169Z" fill={paint.skin} />
            <path d="M133 158L158 172L183 157L192 174L162 193L128 174Z" fill="#2b3b46" stroke={color} strokeWidth="1.5" />
            <path d="M126 97Q125 75 154 70Q185 68 195 96L193 123L184 145L169 157L149 152L134 138L127 118Q118 119 117 108Q116 101 126 97Z" fill={paint.skin} />
            <path d="M181 90L192 98L188 129L175 145L153 150L169 155L184 143L193 120Z" fill="#946255" opacity="0.65" stroke="none" />
            <path d="M124 107L115 89L121 73L111 64L135 66L153 51L149 65Q179 48 198 62L190 69L205 78L197 100L185 111L179 88L148 88L132 103Z" fill="#202b38" />
            <path d="M129 80L142 76L174 70L184 64M136 86L176 78L193 77M126 75L133 70" stroke="#6f6b70" strokeWidth="1.7" />
            <path d="M139 108L152 105M169 104L181 106" stroke="#34303a" strokeWidth="3.2" />
            <path d="M143 113H149M172 111H177" stroke="#172937" strokeWidth="2.6" />
            <path d="M161 111L158 125L165 127M128 109L125 112" stroke="#956854" strokeWidth="1.6" />
            <path d="M150 136L161 139L174 134" stroke="#5b3e42" strokeWidth="2" />
            <circle cx="126" cy="124" r="7" fill="#263b46" stroke={color} strokeWidth="1.5" />
            <path d="M125 120L129 124L125 128M134 148L143 159M188 92L190 98" stroke="#ffe4c4" strokeWidth="1.7" />
            <path d="M88 220H93M217 223H223M118 307H123M208 305H213" stroke={color} strokeWidth="3" />
            <path d="M224 116L228 109L230 117L238 119L230 122L227 130L224 122L217 120Z" fill="#ffe7c4" stroke="none" />
          </>
        )}

        {ally === 'aegis' && (
          <>
            <path d="M22 279V188L34 180V165L48 159V180L63 173V153L78 148V165L94 157V138L108 132V286ZM230 286V146L244 152V173L259 181V164L274 172V192L290 201V184L302 192V292Z" fill={paint.signal} fillOpacity="0.17" stroke={color} strokeWidth="1.2" />
            <path d="M23 210L108 161M23 239L108 190M23 268L108 219M48 196V224M78 206V236M48 253V279M232 177L301 221M232 209L301 253M257 192V223M279 239V272" stroke={color} strokeWidth="0.9" opacity="0.4" />
            <path d="M122 165L184 163L225 179Q255 188 262 216L276 373L60 373L59 222Q58 193 91 179Z" fill={paint.coat} />
            <path d="M96 189L110 216L104 290L82 343L64 346L67 220Z" fill="#39445a" />
            <path d="M130 170L176 168L204 276L162 304L123 264Z" fill="#f4e9d8" />
            <path d="M150 186L170 185L177 203L166 216L150 204ZM157 213L168 213L181 274L165 294L151 275Z" fill="#b83c43" />
            <path d="M154 190L166 192L164 201M161 226L166 270" stroke="#f47b6e" strokeWidth="2" />
            <path d="M119 162L145 185L149 245L109 218L122 204L102 193Z" fill="#526078" />
            <path d="M185 162L171 187L177 253L215 208L197 197L206 185Z" fill="#36465d" />
            <path d="M121 166L139 186L144 219M186 168L176 188L181 224M82 202L96 198M202 309L212 354" stroke={color} strokeWidth="1.2" opacity="0.78" />
            <path d="M212 190Q236 183 246 206L251 228L260 192L280 197L278 253Q275 279 251 279L221 265L205 229Z" fill={paint.coat} />
            <path d="M257 194L280 199L283 187L260 181Z" fill="#ede5da" />
            <path d="M261 185L257 172L248 162Q245 155 251 152L261 159L259 137Q258 129 264 128Q270 128 271 137L274 158L281 157Q290 160 289 172L282 188Z" fill={paint.skin} />
            <path d="M272 160L272 173M280 164L280 174M262 164L266 169M263 135L265 149" stroke="#a76c58" strokeWidth="1.4" />
            <path d="M254 239L262 247L271 237M220 211L232 232M115 300L121 353" stroke="#111e31" strokeWidth="2.5" />
            <path d="M151 144L179 144L184 167L165 187L143 169Z" fill={paint.skin} />
            <path d="M142 164L165 181L153 200L133 176ZM182 162L165 181L178 199L193 174Z" fill="#fff3dc" />
            <path d="M123 97Q128 76 158 75Q190 75 199 101L197 129L188 150L176 161L149 159L132 147L123 126Q114 125 112 115Q111 106 123 106Z" fill={paint.skin} />
            <path d="M188 108L195 106L193 132L180 149L158 152L175 159L188 150L197 129Z" fill="#b6765b" opacity="0.6" stroke="none" />
            <path d="M121 111L111 101L108 84L97 83Q111 68 132 66L119 56Q151 58 173 53Q203 49 211 76L204 94L194 108L190 91Q166 98 144 85L130 94Z" fill={paint.metal} />
            <path d="M112 79Q149 65 194 72M122 86Q157 76 192 83M139 63Q169 57 194 64M196 84L197 93" stroke="#fff0b5" strokeWidth="2.2" />
            <path d="M134 108L148 105M168 106L182 109" stroke="#835731" strokeWidth="3.5" />
            <path d="M138 115H145M172 116H179" stroke="#283340" strokeWidth="2.8" />
            <path d="M157 113L153 130L163 132M132 129L140 133M179 134L186 130" stroke="#b47b60" strokeWidth="1.5" />
            <path d="M147 142Q159 147 174 140L165 150L153 149Z" fill="#7a4543" strokeWidth="1.2" />
            <path d="M145 140L153 140M130 120L134 123M184 118L188 120" stroke="#fff1d4" strokeWidth="1.8" />
            <path d="M200 209L205 199L212 209L205 216Z" fill={paint.metal} strokeWidth="1.3" />
            <path d="M197 245L219 247L217 257L195 254Z" fill="#111d31" />
            <path d="M201 244L206 236L211 243L217 239L219 246Z" fill="#fff0d0" strokeWidth="1" />
            <path d="M117 224L133 224L145 239L141 254L124 260L113 244Z" fill={paint.skin} />
            <path d="M46 235L95 218L143 236L140 291Q129 326 95 346Q60 328 50 292Z" fill={paint.metal} strokeWidth="2.8" />
            <path d="M58 244L95 231L131 245L128 289Q119 314 95 331Q71 315 62 288Z" fill="#283342" stroke="#fff0b4" strokeWidth="1.3" />
            <path d="M70 282V259H81V248H90V261H100V248H110V259H121V282L112 296H79ZM85 284V272H105V284" fill={paint.metal} strokeWidth="1.6" />
            <path d="M75 300L95 316L114 301M53 246L56 269M135 248L132 270" stroke="#fff0b5" strokeWidth="1.6" />
            <path d="M126 231Q129 226 133 232L140 241Q142 247 137 248L129 241M121 237L130 248" fill={paint.skin} stroke="#8f624f" strokeWidth="1.5" />
            <path d="M176 303H179M176 329H179" stroke={color} strokeWidth="4" />
            <path d="M52 134L57 123L61 134L72 138L61 142L57 153L53 142L43 138Z" fill={color} stroke="none" opacity="0.85" />
          </>
        )}

        {ally === 'clock' && (
          <>
            <path d="M80 157A94 108 0 0 1 207 51M228 73A94 108 0 0 1 247 165M68 129L80 130M90 69L99 78M145 37L147 49M203 49L198 61M236 89L225 95" stroke={color} strokeWidth="1.4" opacity="0.62" />
            <path d="M72 116L88 110L80 94M224 65L232 78L246 77M165 40L165 54" stroke="#eee0ff" strokeWidth="1" opacity="0.58" />
            <path d="M128 164L177 162L204 180L218 245L230 288L240 375L72 375L86 288L82 242L98 192Z" fill={paint.coat} />
            <path d="M143 174L171 173L200 372L128 373L129 251Z" fill="#221f39" />
            <path d="M106 183L128 178L122 242L110 302L75 312L65 289L81 225Z" fill={paint.coat} />
            <path d="M91 269L111 278L104 303L77 305Z" fill="#292c46" stroke={color} strokeWidth="1.4" />
            <path d="M87 296L103 300L108 319L102 338Q98 342 95 336L94 326L88 337Q83 339 82 333L77 319Z" fill={paint.skin} />
            <path d="M85 312L90 322M93 309L99 321M86 230L84 251M116 319L107 361M208 316L224 364" stroke="#534060" strokeWidth="1.7" />
            <path d="M128 158L154 186L158 248L118 199L113 181Z" fill={paint.signal} />
            <path d="M178 157L164 185L158 248L192 199L201 179Z" fill={paint.coat} stroke={color} strokeWidth="1.5" />
            <path d="M126 206L141 263L127 365M189 213L181 276L197 366M101 198L95 224" stroke={color} strokeWidth="1.6" />
            <path d="M145 211L150 254L167 263L179 241M136 284L147 294V324L138 335M183 289L173 302V343L183 352" stroke={color} strokeWidth="1" opacity="0.75" />
            <path d="M149 260L159 251L169 260L159 273Z" fill={paint.signal} stroke="#efe7ff" strokeWidth="1.1" />
            <path d="M151 145L173 143L182 168L161 188L140 167Z" fill={paint.skin} />
            <path d="M123 95Q128 77 154 76Q182 73 189 98L185 128L177 149L157 161L139 151L126 132L121 117Q113 116 114 106Q114 99 123 101Z" fill={paint.skin} />
            <path d="M179 100L186 102L181 130L167 145L147 150L158 158L176 147L185 125Z" fill="#88788b" opacity="0.55" stroke="none" />
            <path d="M123 116L111 103L109 87L104 77L117 76L113 66L133 67Q148 49 170 59L183 56L193 72L199 76L196 95L184 111L180 86Q154 95 138 81L129 93Z" fill="#d7dee7" />
            <path d="M115 86L122 81M128 74L146 68L171 67M139 78L177 74M189 80L188 95" stroke="#fff8eb" strokeWidth="2.1" />
            <path d="M127 103L144 100M164 99L180 101" stroke="#e9e7e5" strokeWidth="3.2" />
            <ellipse cx="138" cy="111" rx="14" ry="11" fill="#baa5ff" fillOpacity="0.08" stroke={paint.metal} strokeWidth="1.7" />
            <ellipse cx="172" cy="109" rx="14" ry="11" fill="#baa5ff" fillOpacity="0.08" stroke={paint.metal} strokeWidth="1.7" />
            <path d="M152 110Q156 106 158 109M124 109L118 106M186 107L190 103" stroke="#e7d8ae" strokeWidth="1.6" />
            <path d="M135 112L142 111M168 109H175" stroke="#26313e" strokeWidth="2.3" />
            <path d="M154 114L151 128L160 130M134 127L142 130M168 127L174 125" stroke="#9c7e80" strokeWidth="1.4" />
            <path d="M137 140L148 144L158 140L168 142L180 134L176 153L158 172L141 157Z" fill="#d7dee7" />
            <path d="M149 147L161 149L168 145M151 156L158 163L168 152" stroke="#8e96ad" strokeWidth="1.4" />
            <path d="M186 200L209 227L200 247L224 262L252 255L265 280L234 302Q218 306 198 291L168 250Z" fill={paint.coat} />
            <path d="M241 257L253 252L267 276L254 286L241 276Z" fill="#2c2849" stroke={color} strokeWidth="1.5" />
            <path d="M218 267L215 258Q216 253 222 255L237 260L251 255L263 246Q268 243 271 248L263 260L250 272L235 278Z" fill={paint.skin} />
            <path d="M237 267L250 263L259 256M220 261L228 267M196 255L216 279L235 286" stroke="#a594be" strokeWidth="1.6" />
            <circle cx="232" cy="220" r="64" fill={paint.aura} stroke="none" />
            <g transform="translate(232 220) rotate(-18) scale(1 0.82)">
              <circle r="53" stroke={color} strokeWidth="1.4" />
              <path d="M0-53V-45M0 45V53M-53 0H-45M45 0H53M-38-38L-32-32M32 32L38 38M-38 38L-32 32M32-32L38-38" stroke="#f1e8ff" strokeWidth="1.8" />
              <path d="M-5-37A37 37 0 1 0 5-37L0-32Z" fill={paint.signal} stroke="#edddff" strokeWidth="1.5" />
              <path d="M-5-37A37 37 0 1 0 5-37L0-32Z" fill={paint.wafer} stroke="none" opacity="0.75" />
              <path d="M-28-23A36 36 0 0 1-12-33M0-23V0L18 12" stroke="#fff7ee" strokeWidth="2" />
              <circle r="3" fill="#f9f1ff" stroke="none" />
            </g>
            <path d="M224 152L228 141L232 152L243 156L232 160L228 171L224 160L214 156ZM275 284L278 278L281 284L278 290Z" fill="#eee1ff" stroke="none" />
          </>
        )}

        {ally === 'patch' && (
          <>
            <path d="M111 219L78 209L30 227L42 200L18 189L39 176L22 147L57 153L46 123L88 149L113 181ZM209 203L238 215L281 198L269 182L301 165L281 150L294 124L261 136L269 106L234 136L208 170Z" fill={paint.signal} fillOpacity="0.2" stroke={color} strokeWidth="1.4" />
            <path d="M101 199L74 180L61 156L51 147M87 195L52 190L40 180M78 204L49 213M222 184L244 167L257 141M232 195L261 176L277 164M239 204L262 196M63 167L70 173L65 182M248 144L241 150L246 155" stroke={color} strokeWidth="1.5" opacity="0.9" />
            <path d="M47 159L50 165H56M32 190H38M271 144L278 140M284 177L278 181M57 202L62 200" stroke="#e5ffd0" strokeWidth="2.4" />
            <path d="M107 174L190 170L224 190L232 237L256 293L276 367L212 346L165 375L116 351L47 368L70 289L77 222L85 189Z" fill={paint.coat} />
            <path d="M90 193L66 332L94 318L91 352L122 335L144 368L151 244ZM208 188L230 303L250 345L215 333L201 352L179 322L174 233Z" fill="#0e2c29" />
            <path d="M88 204L75 304L59 350M217 201L227 273L260 347M101 321L98 339M198 325L207 339" stroke={color} strokeWidth="1.6" />
            <path d="M114 181Q149 170 182 184L211 212L220 281L201 340L161 356L116 340L95 286L97 221Z" fill={paint.skin} />
            <path d="M108 272L127 287L137 317L159 334L184 318L205 276L210 310L197 339L159 353L120 338Z" fill="#94b8aa" opacity="0.62" stroke="none" />
            <path d="M97 219Q76 220 63 251L52 278Q50 287 57 287L76 270Q68 287 77 289L92 277L103 259L121 238Z" fill={paint.skin} />
            <path d="M203 210Q225 208 239 226L263 234Q275 238 270 247Q259 257 239 246L219 240L210 264L191 242Z" fill={paint.skin} />
            <path d="M64 271L76 257M78 277L89 261M243 233L253 242L263 244M235 239L242 244" stroke="#7eaa9a" strokeWidth="1.7" />
            <path d="M105 168L137 189L125 228L83 201L81 179ZM185 164L170 192L199 225L228 190L214 169Z" fill={paint.coat} stroke={color} strokeWidth="1.5" />
            <path d="M121 213L152 222L184 211L197 267L164 296L127 278Z" fill={paint.coat} />
            <path d="M135 240L128 247L137 254M175 235L184 243L177 252M164 234L152 262" stroke={color} strokeWidth="3.1" />
            <path d="M135 271L164 282L184 267M144 302L159 310L177 300M143 321L159 329L175 319" stroke="#f5fff0" strokeWidth="1.8" />
            <path d="M142 192L157 185L173 194L168 211L152 215L139 204Z" fill={paint.metal} />
            <path d="M150 195L162 193L165 204L153 207Z" fill={color} stroke="#294d37" strokeWidth="1.2" />
            <path d="M118 159L178 158L187 184L176 199L162 195L151 203L142 194L129 196L113 181Z" fill={paint.skin} />
            <path d="M110 139Q101 111 119 91Q135 72 165 79Q195 81 204 109L202 137Q208 152 196 169Q179 185 150 181Q124 177 114 160Z" fill={paint.skin} />
            <path d="M117 103Q126 85 149 86L166 89Q134 91 125 111L122 129L113 132Z" fill="#fffef3" stroke="none" />
            <path d="M192 111L201 116L197 143L189 154L194 166Q178 181 152 176L138 168L164 170L182 155Z" fill="#91b6a7" opacity="0.7" stroke="none" />
            <path d="M166 115L179 110L191 116L187 133L173 137L163 128Z" fill="#183833" stroke={color} strokeWidth="1.3" />
            <ellipse cx="179" cy="121" rx="5" ry="7" fill={color} stroke="none" />
            <path d="M178 117V121M133 116L142 112M128 136L134 139L140 135" stroke="#fffceb" strokeWidth="2.2" />
            <path d="M174 139Q187 134 201 140L224 143Q241 143 244 152Q239 164 219 170L191 165L173 157L165 149Z" fill={paint.metal} />
            <path d="M175 150Q204 158 239 152M199 144L207 145" stroke="#855d32" strokeWidth="1.8" />
            <path d="M183 142L193 141L217 147M190 160L208 165" stroke="#fff1b9" strokeWidth="1.7" />
            <path d="M114 85L107 57L129 65L138 43L154 61L172 35L181 61L205 50L198 83L158 94Z" fill={paint.signal} />
            <path d="M118 80L154 88L192 79M117 66L122 72M138 54L142 64M174 48L174 65M195 60L190 70" stroke="#e6ffc1" strokeWidth="1.6" />
            <path d="M146 65L164 64L166 81L147 83Z" fill="#143b2b" stroke={color} strokeWidth="1.2" />
            <path d="M152 69L160 68L161 77L153 78ZM150 61V65M157 60V64M153 82V86M160 81V85M142 71H147M143 77H147M165 69H170M166 76H171" stroke={color} strokeWidth="1.2" />
            <path d="M249 202L266 195L283 205L266 215Z" fill={paint.signal} stroke={color} strokeWidth="1.2" />
            <path d="M249 202V215L265 224L283 214V205L266 215Z" fill="#1b493c" stroke={color} strokeWidth="1.2" />
            <path d="M255 207V214M261 210V218M271 214V218M277 210V215M246 193L241 189M277 192L282 186M267 187V181" stroke={color} strokeWidth="1.3" />
            <path d="M65 98L69 87L73 98L84 102L73 106L69 117L65 106L54 102ZM230 101L233 95L236 101L233 107Z" fill="#e9ffd1" stroke="none" />
            <path d="M100 306L102 291L110 284M206 295L214 311V324M77 322L82 320M237 327L242 333" stroke={color} strokeWidth="1.2" opacity="0.8" />
          </>
        )}

        <path d="M63 345Q160 378 257 345M91 355Q160 375 229 355M48 338L56 342M264 342L272 338" stroke={color} strokeWidth="1" opacity="0.38" />
      </g>
    </svg>
  );
}
