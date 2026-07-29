/**
 * The whole HUD is a crosshair dot and one line of prompt text, per the spec.
 * Everything else here is overlays: loading, title, pause, and the end card.
 */
export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      crosshair: document.getElementById('crosshair'),
      prompt: document.getElementById('prompt'),
      touch: document.getElementById('touch'),
      touchInteract: document.getElementById('touch-interact'),
      fade: document.getElementById('fade'),
      loading: document.getElementById('loading'),
      loadingFill: document.getElementById('loading-fill'),
      loadingText: document.getElementById('loading-text'),
      title: document.getElementById('title'),
      paused: document.getElementById('paused'),
      endcard: document.getElementById('endcard'),
      endTime: document.getElementById('end-time'),
      keysDesktop: document.getElementById('keys-desktop'),
      keysMobile: document.getElementById('keys-mobile'),
    };
    this._prompt = null;
  }

  useTouchLayout() {
    this.el.keysDesktop.classList.add('hidden');
    this.el.keysMobile.classList.remove('hidden');
  }

  setLoading(fraction, text) {
    this.el.loadingFill.style.width = `${Math.round(fraction * 100)}%`;
    if (text) this.el.loadingText.textContent = text;
  }

  setPrompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    this.el.prompt.textContent = text || '';
    this.el.prompt.classList.toggle('on', Boolean(text));
    this.el.crosshair.classList.toggle('hot', Boolean(text));
    this.el.touchInteract.classList.toggle('on', Boolean(text));
  }

  setHudVisible(visible) {
    this.el.hud.classList.toggle('hidden', !visible);
  }

  setTouchVisible(visible) {
    this.el.touch.classList.toggle('hidden', !visible);
  }

  /** `seconds` matches the CSS transition on #fade. */
  fade(to, seconds = 0.9) {
    this.el.fade.style.transitionDuration = `${seconds}s`;
    // Force a reflow so consecutive fades always animate.
    void this.el.fade.offsetWidth;
    this.el.fade.style.opacity = String(to);
  }

  show(name) {
    this.el[name]?.classList.remove('hidden');
  }

  hide(name) {
    this.el[name]?.classList.add('hidden');
  }

  showEnd(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.el.endTime.textContent = `ESCAPED IN ${m}:${String(s).padStart(2, '0')}`;
    this.show('endcard');
  }
}
