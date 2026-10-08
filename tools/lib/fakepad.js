/**
 * A synthetic standard-mapped pad for the harnesses (8.3.4). Installed before
 * the game loads: `navigator.getGamepads()` reports one pad whose state is
 * whatever `window.__pad` holds, and `window.__pad.unplugged` makes it go away.
 * The game polls it exactly as it would a real one.
 */
(() => {
  const pad = { axes: [0, 0, 0, 0], buttons: new Array(17).fill(0), unplugged: false };
  window.__pad = pad;
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () =>
      pad.unplugged
        ? [null]
        : [
            {
              id: 'harness pad (STANDARD GAMEPAD)',
              index: 0,
              connected: true,
              mapping: 'standard',
              timestamp: performance.now(),
              axes: pad.axes.slice(),
              buttons: pad.buttons.map((v) => ({ pressed: Boolean(v), touched: Boolean(v), value: v })),
            },
          ],
  });
})();
