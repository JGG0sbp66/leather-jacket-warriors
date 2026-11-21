import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

interface IntroCutsceneProps {
  onComplete: () => void;
  onUnlock: () => void;
  onRise: () => void;
}

export function IntroCutscene({ onComplete, onUnlock, onRise }: IntroCutsceneProps) {
  const [phase, setPhase] = useState<'waiting' | 'board' | 'reply'>('waiting');
  const dialog = useRef<HTMLDialogElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const started = phase !== 'waiting';

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    startButton.current?.focus({ preventScroll: true });
    return () => element.close();
  }, []);

  useEffect(() => {
    if (!started) return;
    let frame = 0;
    let elapsed = 0;
    let last = performance.now();
    let replied = false;
    const visibility = () => {
      if (dialog.current) dialog.current.dataset.paused = String(document.hidden || !document.hasFocus());
      last = performance.now();
    };
    const animate = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      if (!document.hidden && document.hasFocus()) {
        elapsed += dt;
        if (progress.current) progress.current.style.transform = `scaleX(${Math.min(1, elapsed / 5000)})`;
        if (elapsed >= 2600 && !replied) {
          replied = true;
          setPhase('reply');
          onRise();
        }
        if (elapsed >= 5000) { onComplete(); return; }
      }
      frame = requestAnimationFrame(animate);
    };
    visibility();
    frame = requestAnimationFrame(animate);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', visibility);
    window.addEventListener('focus', visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', visibility);
      window.removeEventListener('focus', visibility);
    };
  }, [started, onComplete, onRise]);

  function begin() {
    onUnlock();
    setPhase('board');
    skipButton.current?.focus({ preventScroll: true });
  }

  return <dialog ref={dialog} className={`intro-dialog intro-${phase}`} aria-label="重返算力神殿：皮衣无双，开场演出" onCancel={(event) => { event.preventDefault(); onComplete(); }}>
    <div className="intro-stage" onClick={() => { if (started) onComplete(); }}>
      <svg className="intro-environment" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#071015"/><stop offset="1" stopColor="#1a302c"/></linearGradient>
          <linearGradient id={`${id}-door`} x2="0" y2="1"><stop stopColor="#b6ed76" stopOpacity=".16"/><stop offset="1" stopColor="#b6ed76" stopOpacity="0"/></linearGradient>
          <radialGradient id={`${id}-ground`}><stop stopColor="#92b39d" stopOpacity=".3"/><stop offset="1" stopColor="#101918" stopOpacity="0"/></radialGradient>
        </defs>
        <path d="M0 0h960v540H0z" fill={`url(#${id}-sky)`}/>
        <path d="M0 60h140v-30h190v50h100V20h300v50h230v380H0z" fill="#0b1418"/>
        <path d="M85 65h80v310H85zm135 0h55v310h-55zm530 0h50v310h-50zm95 0h50v310h-50z" fill="#20312f" opacity=".6"/>
        <path d="M292 85h422v312H292z" fill="#030a0c" stroke="#455952" strokeWidth="3"/>
        <path d="M329 117h347v279H329z" fill={`url(#${id}-door)`} stroke="#6b8b68" strokeWidth="2"/>
        <path d="M501 120v276M330 175h346M354 119v276M650 119v276" stroke="#547d5b" opacity=".4"/>
        <path d="m285 57 192-12 241 12-29 36H312z" fill="#1c2b29" stroke="#475851"/>
        <text x="502" y="80" fill="#9cad95" textAnchor="middle" fontSize="19" letterSpacing="16">算力神殿</text>
        <path d="m258 88-19 60 25 13-17 33m457-105 19 54-17 33 22 58M84 214l43 19-8 33 28 41" fill="none" stroke="#050c0d" strokeWidth="5"/>
        <path d="M0 397h960v143H0z" fill="#0a1718"/>
        <path d="M0 402h960M0 452h960M0 515h960M335 397 70 540m355-143L360 540m189-143 48 143m78-143 210 143" stroke="#37544c" strokeWidth="1" opacity=".5"/>
        <ellipse cx="460" cy="447" rx="340" ry="72" fill={`url(#${id}-ground)`}/>
        <path d="m342 412 83 15m-47 8 173 10m-136 18 209 10m-308 22 133 8" stroke="#b6ed76" opacity=".12" strokeWidth="3"/>
        <g className="intro-rain" stroke="#bbd8d7" strokeWidth="1" opacity=".3">
          {Array.from({ length: 48 }, (_, i) => <path key={i} d={`M${(i * 137) % 1050} ${(i * 73) % 680 - 160}l-21 68`}/>)}
        </g>
      </svg>
      <div className="intro-scene-label"><span>序章</span><strong>算力神殿 · 暴雨夜</strong></div>
      <div className="intro-projection" aria-hidden="true">
        <svg viewBox="0 0 220 155" fill="none">
          <path d="M18 25h184v116H18z" fill="#7fcac3" fillOpacity=".08" stroke="currentColor"/>
          {[57, 110, 163].map((x, i) => <g key={x} opacity={i === 1 ? 1 : .4} transform={`translate(${x} ${i === 1 ? 0 : 13})`}><path d="m-24 76 15-12h18l15 12 10 43h-68z" fill="currentColor" fillOpacity=".5"/><path d="m-12 36 12-5 12 5 3 18-15 15-15-15z" fill="#94d4cc"/><path d="M-10 47h7m6 0h7M0 73l-5 8 5 19 5-19z" stroke="#062625" strokeWidth="3"/></g>)}
          <path d="M5 4v16M5 4h16m194 0h-16m16 0v16M5 151v-16m0 16h16m194 0h-16m16 0v-16" stroke="currentColor" strokeWidth="2"/>
        </svg>
        <span>资本长老会（董事会）</span>
      </div>
      <svg className="intro-actor" viewBox="0 0 320 380" aria-hidden="true">
        <ellipse cx="160" cy="354" rx="99" ry="16" fill="#020707" opacity=".7"/>
        <g className="intro-chair" fill="#e8eee8" stroke="#adbcb2" strokeWidth="3">
          <path d="m98 195 6 88h98l6-88z"/>
          <path d="M119 206v60m19-60v60m20-60v60m19-60v60m18-60v60" fill="none" stroke="#9aada0" strokeWidth="4"/>
          <path d="m99 280-18 10 9 9h122l11-9-20-10z"/>
          <path d="m105 296 99 57m-12-57-92 57" fill="none" stroke="#dee8dd" strokeWidth="8"/>
        </g>
        <g className="intro-chair-pixels" fill="#b6ed76">
          {Array.from({ length: 18 }, (_, i) => <rect key={i} x={92 + i % 6 * 22} y={204 + Math.floor(i / 6) * 48} width={5 + i % 3 * 3} height={6 + i % 2 * 3} style={{ '--dx': `${(i % 6 - 2.5) * 31}px`, '--dy': `${-70 - i % 5 * 24}px`, '--delay': `${i % 5 * 35}ms` } as CSSProperties}/>)}
        </g>
        <g className="intro-standing-legs" fill="#111c20" stroke="#53625c" strokeWidth="2">
          <path d="m120 255 31 2-9 83-29 4zm34 2h31l9 84-29 1z"/>
          <path d="m112 334 31-1 2 19h-49v-9zm52 0 31-1 18 13v8h-49z" fill="#030808"/>
        </g>
        <g className="intro-seated-legs" fill="#132025" stroke="#53625c" strokeWidth="2">
          <path d="m119 266 35 9-24 32-11 36-24-4 5-53zm33 8 47-2 19 26-24 45-22-7 16-36-46 4z"/>
          <path d="m92 332 28 7-4 15H78v-9zm81-3 25 8 8 16h-42z" fill="#030808"/>
        </g>
        <g className="intro-actor-upper">
          <path d="m113 155-35 38-12 58 29 5 13-49-11 64 110 2-16-65 19 49 27-10-20-57-31-35z" fill="#071015" stroke="#67746c" strokeWidth="2"/>
          <path d="m136 148-23 13 21 90 18 11 25-26 9-83-17-7z" fill="#152327"/>
          <path d="m134 150-25 15 17 31 19-12-9 50m39-84 12 17-17 29-13-12 2 77" fill="#243438" stroke="#789482" strokeWidth="1.5"/>
          <path d="M153 186v73m-59-30 16 3m79 0 20-5" stroke="#acb9aa" strokeWidth="2"/>
          <path d="m136 132 2 21 15 16 21-18-4-23" fill="#aa9681"/>
          <path d="m127 84 48-4 11 27-10 34-22 15-23-22-9-29z" fill="#cab499" stroke="#685f54" strokeWidth="2"/>
          <path d="m123 108-6-25 12-21 45 1 16 18-4 27-13-19-34 2-8 20z" fill="#88938b"/>
          <path d="m126 82 13-12 34 2 7 10" fill="none" stroke="#b9c2b6" strokeWidth="4"/>
          <g fill="#081418" stroke="#9db3a3" strokeWidth="2"><path d="M128 107h21v12h-18zm27 0h23l-4 12h-19z"/><path d="M149 110h6"/></g>
          <path d="m149 133 14-1" stroke="#716650" strokeWidth="2"/>
          <path d="m67 251 26 4-2 14-20 3-10-10zm143 4 24-8 6 13-8 11-22-3z" fill="#b6a184"/>
          <path d="m108 174-17 35-6 25m99-61 21 40" stroke="#b6ed76" strokeWidth="2" opacity=".5"/>
        </g>
      </svg>
      {phase === 'waiting' ? <div className="intro-cover"><small>重返算力神殿</small><h2>皮衣无双</h2><button ref={startButton} className="primary-button" onClick={begin}>开始演出</button><p>5 秒开场 · 点击后启用音效</p></div> : <div className="intro-subtitles" aria-live="polite" aria-atomic="true"><span>{phase === 'board' ? '董事会投影' : '皮衣老J'}</span><p>{phase === 'board' ? '老J，董事会的投票已经结束了！交出最高管理员密钥和那件黑皮衣，体面退场吧！' : '如果你想要，你就自己来拿。但这规矩，你都懂的。'}</p></div>}
      <button ref={skipButton} className="intro-skip" onClick={(event) => { event.stopPropagation(); onComplete(); }}>跳过演出 <span>ESC</span></button>
      <div className="intro-progress"><div ref={progress}/></div>
    </div>
  </dialog>;
}
