/**
 * Alerta sonoro gerado via Web Audio (sem arquivo de áudio).
 * Navegadores só liberam som após uma interação do usuário: chame unlockAudio() em um clique.
 */
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

export function audioEnabled() {
  return !!ctx && ctx.state === 'running';
}

export function chime(kind: 'new' | 'ready' = 'new') {
  if (!ctx || ctx.state !== 'running') return;
  const notes = kind === 'new' ? [880, 1175, 1568] : [660, 990];
  notes.forEach((freq, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    const t = ctx!.currentTime + i * 0.16;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx!.destination);
    o.start(t);
    o.stop(t + 0.4);
  });
  navigator.vibrate?.(kind === 'new' ? [120, 60, 120] : [80]);
}
