// DOM key codes and Android KeyEvent codes are different namespaces.
export function browserGameKey(event: { key?: string; code?: string; keyCode?: number; which?: number }, androidWebView = false): number {
  const names: Record<string, number> = {
    ArrowUp: 38, Up: 38, ArrowDown: 40, Down: 40,
    ArrowLeft: 37, Left: 37, ArrowRight: 39, Right: 39,
    DPAD_UP: 38, DPAD_DOWN: 40, DPAD_LEFT: 37, DPAD_RIGHT: 39,
    DPadUp: 38, DPadDown: 40, DPadLeft: 37, DPadRight: 39,
    Enter: 13, NumpadEnter: 13, Select: 13, Accept: 13, DPAD_CENTER: 13,
    Escape: 27, Esc: 27, Backspace: 27, BrowserBack: 27, GoBack: 27,
    Back: 27, Return: 13, OK: 13, ContextMenu: 80, Menu: 80,
    ' ': 32, Space: 32, Spacebar: 32,
  };
  const named = names[event.key] || names[event.code];
  if (named) return named;
  const code = event.keyCode || event.which || 0;
  // Some Android hosts forward raw DPAD codes instead of DOM Arrow key codes.
  // Only use this fallback for unnamed Android events: desktop 19 is Pause.
  const unnamed = !event.key || event.key === 'Unidentified';
  if (androidWebView && unnamed && code >= 19 && code <= 22) return androidGameKey(code);
  if ([4, 8, 461, 10009].indexOf(code) >= 0) return 27;
  if (code === 23) return 13;
  if (code === 93) return 80;
  return [13, 27, 32, 37, 38, 39, 40, 65, 68, 75, 80, 82, 83, 84, 87].indexOf(code) >= 0 ? code : 0;
}

export function androidGameKey(code: number): number {
  return ({ 19: 38, 20: 40, 21: 37, 22: 39, 23: 13, 66: 13,
    62: 32, 4: 27, 111: 27, 96: 13, 97: 27, 108: 80, 82: 80 } as Record<number, number>)[code] || 0;
}
