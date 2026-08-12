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
      endReadout: document.getElementById('end-readout'),
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

  /**
   * The end card's readout — phase 5, spec 5.3.1.
   *
   * It reports the run the way the ship would: what got its power back, what is
   * in the sockets, how long you were aboard. Not a score and not a rating —
   * the same register as the airlock panel, which is the only readout the
   * player has actually been reading.
   */
  showEnd({ compartments, spaces, cells, sockets, seconds }) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const rows = [
      ['COMPARTMENTS RESTORED', `${compartments} / ${spaces}`],
      ['POWER CELLS SEATED', `${cells} / ${sockets}`],
      ['TIME ABOARD', `${m}:${String(s).padStart(2, '0')}`],
    ];

    this.el.endReadout.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      })
    );
    this.show('endcard');
  }
}
