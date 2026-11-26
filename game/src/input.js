// Skyline Courier — keyboard and mouse input.
// One job: turn raw device events into a clean, frame-ready control state.

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    pitchUp: false, pitchDown: false,
    rollLeft: false, rollRight: false,
    yawLeft: false, yawRight: false,
    throttleUp: false, throttleDown: false,
    flaps: false, gear: false, brakes: false,
    pause: false, restart: false, menu: false,
    confirm: false, mission1: false, mission2: false, mission3: false,
    cameraOrbitX: 0, cameraOrbitY: 0, cameraZoom: 0,
    mouseDown: false, mouseX: 0, mouseY: 0,
  };

  const KEYMAP = {
    ArrowUp: 'pitchDown', KeyW: 'pitchDown',
    ArrowDown: 'pitchUp', KeyS: 'pitchUp',
    ArrowLeft: 'rollLeft', KeyA: 'rollLeft',
    ArrowRight: 'rollRight', KeyD: 'rollRight',
    KeyQ: 'yawLeft', KeyE: 'yawRight',
    ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
    ControlLeft: 'throttleDown', ControlRight: 'throttleDown',
    KeyF: 'flaps', KeyG: 'gear', KeyB: 'brakes',
    KeyP: 'pause', Escape: 'pause',
    KeyR: 'restart', KeyM: 'menu',
    Enter: 'confirm', Space: 'confirm',
    Digit1: 'mission1', Digit2: 'mission2', Digit3: 'mission3',
  };

  // Edge-triggered actions (flaps/gear/pause/...) fire once per press.
  const pressed = new Set();

  function onKeyDown(e) {
    if (e.repeat) return;
    const action = KEYMAP[e.code];
    if (!action) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    state[action] = true;
    pressed.add(action);
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    keys.delete(e.code);
    if (action) state[action] = false;
  }

  let lastX = 0, lastY = 0;
  function onMouseDown(e) {
    state.mouseDown = true; lastX = e.clientX; lastY = e.clientY;
    state.mouseX = e.clientX; state.mouseY = e.clientY;
  }
  function onMouseMove(e) {
    state.mouseX = e.clientX; state.mouseY = e.clientY;
    if (!state.mouseDown) return;
    state.cameraOrbitX += (e.clientX - lastX) * 0.004;
    state.cameraOrbitY += (e.clientY - lastY) * 0.004;
    state.cameraOrbitY = Math.max(-0.5, Math.min(0.6, state.cameraOrbitY));
    lastX = e.clientX; lastY = e.clientY;
  }
  function onMouseUp() { state.mouseDown = false; }
  function onWheel(e) {
    e.preventDefault();
    state.cameraZoom = Math.max(-1, Math.min(1, state.cameraZoom + Math.sign(e.deltaY) * 0.12));
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Call once per frame: returns the actions pressed since the last frame.
  function consumePressed() {
    const out = new Set(pressed);
    pressed.clear();
    return out;
  }

  return { state, consumePressed, keys };
}
