/** Key names a model can press, turned into what the browser's input events expect. */

export type KeyDef = { key: string; code: string; vk: number; text?: string };

const NAMED: Record<string, KeyDef> = {
  enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  return: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  tab: { key: "Tab", code: "Tab", vk: 9 },
  escape: { key: "Escape", code: "Escape", vk: 27 },
  esc: { key: "Escape", code: "Escape", vk: 27 },
  backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  delete: { key: "Delete", code: "Delete", vk: 46 },
  space: { key: " ", code: "Space", vk: 32, text: " " },
  left: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  up: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  right: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  down: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  home: { key: "Home", code: "Home", vk: 36 },
  end: { key: "End", code: "End", vk: 35 },
  pageup: { key: "PageUp", code: "PageUp", vk: 33 },
  pagedown: { key: "PageDown", code: "PageDown", vk: 34 },
};

const MODIFIERS: Record<string, number> = { alt: 1, option: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, command: 4, shift: 8 };

/** Editing shortcuts Chrome only honours when told which editing command they mean. */
const EDIT_COMMANDS: Record<string, string> = { a: "selectAll", c: "copy", x: "cut", v: "paste", z: "undo" };

export type Press = { def: KeyDef; modifiers: number; commands: string[] };

/** "Enter", "Control+A", "Shift+Tab", "F5" or a single character. */
export function parseKeys(spec: string): Press {
  const parts = spec.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("A key is required.");
  const keyName = parts[parts.length - 1];
  let modifiers = 0;
  for (const part of parts.slice(0, -1)) {
    const bit = MODIFIERS[part.toLowerCase()];
    if (!bit) throw new Error(`Unknown modifier "${part}". Use Control, Alt, Shift or Meta.`);
    modifiers |= bit;
  }
  const lower = keyName.toLowerCase();
  let def = NAMED[lower];
  if (!def) {
    const fn = /^f(\d{1,2})$/.exec(lower);
    if (fn && Number(fn[1]) >= 1 && Number(fn[1]) <= 12) def = { key: `F${fn[1]}`, code: `F${fn[1]}`, vk: 111 + Number(fn[1]) };
    else if (keyName.length === 1) {
      const upper = keyName.toUpperCase();
      const letter = /[A-Z]/.test(upper);
      def = {
        key: keyName,
        code: letter ? `Key${upper}` : /\d/.test(keyName) ? `Digit${keyName}` : "",
        vk: upper.charCodeAt(0),
        text: keyName,
      };
    } else throw new Error(`Unknown key "${keyName}".`);
  }
  const shortcut = (modifiers & (2 | 4)) !== 0 && !(modifiers & 1);
  const commands = shortcut && keyName.length === 1 && EDIT_COMMANDS[lower] ? [EDIT_COMMANDS[lower]] : [];
  // A shortcut types nothing.
  if (shortcut) def = { ...def, text: undefined };
  return { def, modifiers, commands };
}
