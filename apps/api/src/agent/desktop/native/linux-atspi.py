#!/usr/bin/env python3
"""Bluebird's Linux accessibility helper (AT-SPI).

A long-running process: Bluebird writes one JSON request per line on stdin and reads one JSON answer per
line on stdout. It keeps the live accessible objects from the last outline in a table, so a numbered mark
points at exactly that element until the next outline replaces the table.

Needs python3 with PyGObject and the AT-SPI typelib (Debian/Ubuntu: python3-gi gir1.2-atspi-2.0), and
accessibility turned on for the desktop. Typing and clicking by synthetic input work on X11; Wayland
compositors may refuse them, in which case the app's own actions (desktop_click without mouse,
desktop_set_value) still work.
"""
import base64
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile

try:
    import gi

    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi

    IMPORT_ERROR = None
except Exception as error:  # reported by "status", so the person gets a useful message
    Atspi = None
    IMPORT_ERROR = str(error)

table = {}
generation = 0


class Failure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def reply(request_id, ok, body):
    out = dict(body)
    out["ok"] = ok
    if request_id is not None:
        out["id"] = request_id
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def clip(text, length):
    flat = " ".join(str(text).split())
    return flat if len(flat) <= length else flat[: length - 1] + "…"


# --- helpers over AT-SPI -----------------------------------------------------------------------------


def need_atspi():
    if Atspi is None:
        raise Failure("no_atspi", "AT-SPI is not available for python3 (%s). Install python3-gi and gir1.2-atspi-2.0." % IMPORT_ERROR)


def safe(call, default=None):
    try:
        value = call()
        return default if value is None else value
    except Exception:
        return default


def name_of(acc):
    return safe(acc.get_name, "") or ""


def role_of(acc):
    return safe(acc.get_role_name, "") or ""


def states_of(acc):
    return safe(acc.get_state_set)


def has_state(acc, state):
    states = states_of(acc)
    return bool(states and states.contains(state))


def children_of(acc):
    count = safe(acc.get_child_count, 0)
    for index in range(count):
        child = safe(lambda: acc.get_child_at_index(index))
        if child is not None:
            yield child


def extents(acc):
    box = safe(lambda: acc.get_component_iface() and Atspi.Component.get_extents(acc, Atspi.CoordType.SCREEN))
    if box is None or box.width <= 0 or box.height <= 0:
        return None
    return box


def center_of(acc):
    box = extents(acc)
    return None if box is None else (box.x + box.width // 2, box.y + box.height // 2)


def text_of(acc):
    iface = safe(acc.get_text_iface)
    if iface is None:
        return ""
    return safe(lambda: Atspi.Text.get_text(acc, 0, min(Atspi.Text.get_character_count(acc), 400)), "") or ""


ACTIONABLE = {
    "push button", "toggle button", "check box", "radio button", "menu item", "check menu item", "radio menu item",
    "link", "text", "entry", "password text", "combo box", "spin button", "slider", "page tab", "tree item",
    "list item", "table cell", "terminal", "editbar", "push button menu", "icon",
}
EDITABLE = {"text", "entry", "password text", "terminal", "editbar", "paragraph"}
SHOWN = {"frame", "window", "dialog", "alert", "tool bar", "menu bar", "menu", "table", "tree", "tree table", "list", "page tab list", "document frame", "document web", "document text"}


def friendly(role):
    return {
        "push button": "button", "toggle button": "toggle", "check box": "checkbox", "radio button": "radio",
        "menu item": "menuitem", "check menu item": "menuitem", "radio menu item": "menuitem", "page tab": "tab",
        "entry": "textfield", "password text": "textfield", "text": "textfield", "combo box": "combobox",
        "spin button": "stepper", "tree item": "treeitem", "list item": "listitem", "table cell": "cell",
        "frame": "window", "tool bar": "toolbar", "menu bar": "menubar", "page tab list": "tabs",
        "document frame": "document", "document web": "web",
    }.get(role, role.replace(" ", ""))


def build_outline(root, pid, start_mark, max_nodes, max_depth, actions_only):
    lines = []
    state = {"visited": 0, "truncated": False, "mark": start_mark}

    def visit(acc, depth):
        if state["truncated"]:
            return
        if state["visited"] >= max_nodes:
            state["truncated"] = True
            return
        state["visited"] += 1
        role = role_of(acc)
        name = name_of(acc)
        indent = "  " * depth
        next_depth = depth
        showing = has_state(acc, Atspi.StateType.SHOWING) or depth == 0
        if not showing:
            return
        if role in ACTIONABLE and (name or role in EDITABLE or role in {"push button", "toggle button", "check box"}):
            value = ""
            secure = role == "password text"
            if role in EDITABLE and not secure:
                value = text_of(acc)
            mark = state["mark"]
            table[mark] = {"acc": acc, "role": role, "name": name, "pid": pid}
            line = "%s[%d] %s" % (indent, mark, friendly(role))
            if name:
                line += ' "%s"' % clip(name, 90)
            if value and value != name:
                line += ' = "%s"' % clip(value, 70)
            if secure:
                line += " (secure)"
            flags = []
            if has_state(acc, Atspi.StateType.CHECKED):
                flags.append("checked")
            if has_state(acc, Atspi.StateType.SELECTED):
                flags.append("selected")
            if has_state(acc, Atspi.StateType.EXPANDED):
                flags.append("expanded")
            if not has_state(acc, Atspi.StateType.ENABLED):
                flags.append("disabled")
            if has_state(acc, Atspi.StateType.FOCUSED):
                flags.append("focused")
            if flags:
                line += " (%s)" % ", ".join(flags)
            lines.append(line)
            state["mark"] = mark + 1
            next_depth = depth + 1
        elif role in ("label", "static", "paragraph", "heading") or role == "text" and not name:
            text = name or text_of(acc)
            if text and not actions_only:
                lines.append(indent + (("# " if role == "heading" else "") + clip(text, 200)))
            return
        elif role in SHOWN and (name or role in ("frame", "window", "dialog")):
            if not actions_only or role in ("frame", "window", "dialog"):
                lines.append('%s%s "%s"' % (indent, friendly(role), clip(name, 70)))
                next_depth = depth + 1
        if depth >= max_depth:
            return
        for child in children_of(acc):
            visit(child, next_depth)

    visit(root, 0)
    if state["truncated"]:
        lines.append("[…outline cut here; use desktop_look with a mark or a window to look inside one part]")
    return lines, state["truncated"]


# --- applications ---------------------------------------------------------------------------------------


def app_objects():
    need_atspi()
    desktop = Atspi.get_desktop(0)
    return list(children_of(desktop))


def window_objects(app):
    return [w for w in children_of(app) if role_of(w) in ("frame", "window", "dialog", "alert")]


def find_app(query):
    apps = app_objects()
    q = str(query).lower()
    exact = [a for a in apps if name_of(a).lower() == q or str(safe(a.get_process_id, "")) == q]
    if exact:
        return exact[0]
    partial = [a for a in apps if q in name_of(a).lower()]
    if len(partial) == 1:
        return partial[0]
    if len(partial) > 1:
        raise Failure("ambiguous_app", '"%s" matches several apps: %s. Use the exact name.' % (query, ", ".join(name_of(a) for a in partial)))
    raise Failure("no_app", 'No running app matches "%s". Use desktop_open to launch it.' % query)


def held(mark):
    try:
        key = int(mark)
    except (TypeError, ValueError):
        key = -1
    item = table.get(key)
    if item is None:
        raise Failure("no_mark", "There is no mark %s. Use desktop_look to see the current marks." % mark)
    # The object must still exist and still be the same kind of thing.
    try:
        if item["acc"].get_role_name() != item["role"]:
            raise ValueError("changed")
    except Exception:
        raise Failure("stale_mark", "That mark is out of date: the window changed. Use desktop_look again.")
    return item


# --- input -----------------------------------------------------------------------------------------------

KEYSYMS = {
    "enter": 0xFF0D, "return": 0xFF0D, "tab": 0xFF09, "escape": 0xFF1B, "esc": 0xFF1B, "space": 0x20,
    "backspace": 0xFF08, "delete": 0xFFFF, "left": 0xFF51, "up": 0xFF52, "right": 0xFF53, "down": 0xFF54,
    "home": 0xFF50, "end": 0xFF57, "pageup": 0xFF55, "pagedown": 0xFF56,
}
for _n in range(1, 13):
    KEYSYMS["f%d" % _n] = 0xFFBD + _n
MODIFIERS = {"ctrl": 0xFFE3, "control": 0xFFE3, "shift": 0xFFE1, "alt": 0xFFE9, "option": 0xFFE9, "opt": 0xFFE9, "cmd": 0xFFEB, "command": 0xFFEB, "meta": 0xFFEB, "super": 0xFFEB, "win": 0xFFEB}


def press_chord(spec):
    parts = [p.strip() for p in str(spec).lower().split("+") if p.strip()]
    if not parts:
        raise Failure("bad_key", "A key is required.")
    key = parts[-1]
    mods = []
    for name in parts[:-1]:
        if name not in MODIFIERS:
            raise Failure("bad_key", 'Unknown modifier "%s". Use ctrl, shift, alt or super.' % name)
        mods.append(MODIFIERS[name])
    if key in KEYSYMS:
        sym = KEYSYMS[key]
    elif len(key) == 1:
        sym = ord(key)
    else:
        raise Failure("bad_key", 'Unknown key "%s".' % spec)
    sym_flag = Atspi.KeySynthType.SYM
    for m in mods:
        Atspi.generate_keyboard_event(m, None, Atspi.KeySynthType.PRESS | sym_flag)
    Atspi.generate_keyboard_event(sym, None, Atspi.KeySynthType.PRESS | sym_flag)
    Atspi.generate_keyboard_event(sym, None, Atspi.KeySynthType.RELEASE | sym_flag)
    for m in reversed(mods):
        Atspi.generate_keyboard_event(m, None, Atspi.KeySynthType.RELEASE | sym_flag)


def mouse(x, y, event):
    Atspi.generate_mouse_event(int(x), int(y), event)


def focus_app(app):
    for window in window_objects(app):
        if safe(lambda: Atspi.Component.grab_focus(window)):
            return


# --- clipboard and screenshots (through the tools the desktop already has) ---------------------------------


def run_tool(candidates, input_text=None):
    for argv in candidates:
        if shutil.which(argv[0]) is None:
            continue
        try:
            done = subprocess.run(argv, input=input_text, capture_output=True, text=True, timeout=10)
            if done.returncode == 0:
                return done.stdout
        except Exception:
            continue
    raise Failure("no_tool", "No clipboard tool found. Install wl-clipboard (Wayland) or xclip (X11).")


def take_screenshot(window_box):
    directory = tempfile.mkdtemp(prefix="bluebird-screen-")
    target = os.path.join(directory, "shot.png")
    try:
        full = [
            ["grim", target],
            ["gnome-screenshot", "-f", target],
            ["spectacle", "-b", "-n", "-o", target],
            ["scrot", "-o", target],
            ["import", "-window", "root", target],
        ]
        done = False
        for argv in full:
            if shutil.which(argv[0]) is None:
                continue
            if subprocess.run(argv, capture_output=True, timeout=20).returncode == 0 and os.path.exists(target) and os.path.getsize(target) > 500:
                done = True
                break
        if not done:
            raise Failure("no_tool", "No screenshot tool found. Install grim (Wayland), gnome-screenshot, scrot or ImageMagick.")
        if window_box is not None and shutil.which("convert"):
            cropped = os.path.join(directory, "crop.png")
            geometry = "%dx%d+%d+%d" % (window_box.width, window_box.height, max(window_box.x, 0), max(window_box.y, 0))
            if subprocess.run(["convert", target, "-crop", geometry, "+repage", cropped], capture_output=True, timeout=20).returncode == 0:
                target = cropped
        if shutil.which("convert"):
            jpeg = os.path.join(directory, "shot.jpg")
            if subprocess.run(["convert", target, "-quality", "75", jpeg], capture_output=True, timeout=20).returncode == 0:
                with open(jpeg, "rb") as handle:
                    return base64.b64encode(handle.read()).decode(), "image/jpeg"
        with open(target, "rb") as handle:
            return base64.b64encode(handle.read()).decode(), "image/png"
    finally:
        shutil.rmtree(directory, ignore_errors=True)


# --- requests ------------------------------------------------------------------------------------------------


def do_action(acc, wanted=None):
    iface = safe(acc.get_action_iface)
    if iface is None:
        return None
    count = safe(lambda: Atspi.Action.get_n_actions(acc), 0)
    names = [safe(lambda i=i: Atspi.Action.get_action_name(acc, i), "") for i in range(count)]
    order = [wanted.lower()] if wanted and wanted != "AXPress" else ["click", "press", "activate", "toggle", "select", "expand or contract", "open"]
    for want in order:
        for index, name in enumerate(names):
            if name and name.lower() == want:
                if Atspi.Action.do_action(acc, index):
                    return name
    if count > 0 and not wanted:
        if Atspi.Action.do_action(acc, 0):
            return names[0] or "action"
    return None


def handle(request):
    global table, generation
    op = request.get("op")
    if op == "status":
        if Atspi is None:
            return {"trusted": False, "message": "AT-SPI is not available for python3 (%s). Install python3-gi and gir1.2-atspi-2.0." % IMPORT_ERROR}
        try:
            count = len(app_objects())
        except Exception as error:
            return {"trusted": False, "message": "Could not reach the accessibility bus: %s" % error}
        session = os.environ.get("XDG_SESSION_TYPE", "")
        note = " Wayland session: the apps' own actions work, but synthetic mouse and keyboard input may be refused." if session == "wayland" else ""
        return {"trusted": True, "message": "Ready." + note, "apps": count, "session": session}
    if op == "apps":
        out = []
        for app in app_objects():
            windows = window_objects(app)
            active = any(has_state(w, Atspi.StateType.ACTIVE) for w in windows)
            out.append({"name": name_of(app), "bundle": "", "pid": safe(app.get_process_id, 0), "frontmost": active, "hidden": not windows})
        return {"apps": out}
    if op == "windows":
        app = find_app(request.get("app"))
        windows = []
        for index, window in enumerate(window_objects(app), start=1):
            entry = {"index": index, "title": name_of(window)}
            box = extents(window)
            if box is not None:
                entry.update({"x": box.x, "y": box.y, "width": box.width, "height": box.height})
            windows.append(entry)
        return {"app": name_of(app), "windows": windows}
    if op == "outline":
        app = find_app(request.get("app"))
        pid = safe(app.get_process_id, 0)
        table = {}
        generation += 1
        max_nodes = int(request.get("maxNodes") or 500)
        actions_only = bool(request.get("actionsOnly"))
        if request.get("within"):
            item = held(request.get("within"))
            root = item["acc"]
            table = {}
            lines, truncated = build_outline(root, pid, 1, max_nodes, 14, actions_only)
        else:
            windows = window_objects(app)
            if not windows:
                raise Failure("no_window", "%s has no open window." % name_of(app))
            index = int(request.get("window") or 1)
            if index < 1 or index > len(windows):
                raise Failure("no_window", "%s has %d window(s); window %d does not exist." % (name_of(app), len(windows), index))
            lines, truncated = build_outline(windows[index - 1], pid, 1, max_nodes, 14, actions_only)
        return {"app": name_of(app), "generation": generation, "marks": len(table), "outline": "\n".join(lines), "truncated": truncated}
    if op == "act":
        item = held(request.get("mark"))
        did = do_action(item["acc"], request.get("action"))
        if did is None:
            raise Failure("action_failed", "%s offers no action of its own. Try desktop_click with mouse true." % (item["name"] or item["role"]))
        return {"did": did}
    if op == "click":
        if request.get("mark"):
            item = held(request.get("mark"))
            point = center_of(item["acc"])
            if point is None:
                raise Failure("no_frame", "That element has no position on screen.")
            x, y = point
        elif request.get("x") is not None and request.get("y") is not None:
            x, y = request["x"], request["y"]
        else:
            raise Failure("no_target", "Give a mark or x and y.")
        mouse(x, y, "abs")
        event = "b3c" if request.get("right") else ("b1d" if request.get("double") else "b1c")
        mouse(x, y, event)
        return {"x": int(x), "y": int(y)}
    if op == "set_value":
        item = held(request.get("mark"))
        acc = item["acc"]
        if safe(acc.get_editable_text_iface) is None:
            raise Failure("not_settable", "That field does not allow its value to be set directly. Use desktop_type instead.")
        if not Atspi.EditableText.set_text_contents(acc, str(request.get("text", ""))):
            raise Failure("not_settable", "That field refused the new value. Use desktop_type instead.")
        return {"value": text_of(acc)}
    if op == "focus":
        item = held(request.get("mark"))
        safe(lambda: Atspi.Component.grab_focus(item["acc"]))
        return {}
    if op == "type":
        if request.get("mark"):
            item = held(request.get("mark"))
            safe(lambda: Atspi.Component.grab_focus(item["acc"]))
        elif request.get("app"):
            focus_app(find_app(request.get("app")))
        Atspi.generate_keyboard_event(0, str(request.get("text", "")), Atspi.KeySynthType.STRING)
        return {}
    if op == "key":
        if request.get("app"):
            focus_app(find_app(request.get("app")))
        for chord in str(request.get("keys", "")).split():
            press_chord(chord)
        return {}
    if op == "scroll":
        if request.get("mark"):
            point = center_of(held(request.get("mark"))["acc"])
            if point:
                mouse(point[0], point[1], "abs")
        dy, dx = int(request.get("dy") or 0), int(request.get("dx") or 0)
        for _ in (range(max(1, abs(dy) // 100)) if dy else []):
            mouse(0, 0, "b4c" if dy > 0 else "b5c")
        for _ in (range(max(1, abs(dx) // 100)) if dx else []):
            mouse(0, 0, "b7c" if dx > 0 else "b6c")
        return {}
    if op == "read":
        item = held(request.get("mark"))
        acc = item["acc"]
        out = {"role": item["role"], "title": name_of(acc), "description": safe(acc.get_description, "")}
        if item["role"] != "password text":
            out["value"] = text_of(acc)
        return out
    if op == "launch":
        name = str(request.get("app", ""))
        try:
            app = find_app(name)
            focus_app(app)
            return {"launched": False, "pid": safe(app.get_process_id, 0)}
        except Failure:
            pass
        for argv in (["gtk-launch", name], ["gio", "launch", name + ".desktop"], [name]):
            if shutil.which(argv[0]) is None:
                continue
            try:
                subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
                return {"launched": True}
            except Exception:
                continue
        raise Failure("no_app", 'Could not find an app named "%s".' % name)
    if op == "activate":
        focus_app(find_app(request.get("app")))
        return {}
    if op == "quit":
        app = find_app(request.get("app"))
        pid = safe(app.get_process_id, 0)
        if not pid:
            raise Failure("no_pid", "Could not find that app's process.")
        os.kill(pid, signal.SIGKILL if request.get("force") else signal.SIGTERM)
        return {"asked": True}
    if op == "screenshot":
        box = None
        if request.get("app"):
            app = find_app(request.get("app"))
            focus_app(app)
            windows = window_objects(app)
            box = extents(windows[0]) if windows else None
        data, mime = take_screenshot(box)
        return {"base64": data, "mime": mime}
    if op == "clipboard_get":
        return {"text": run_tool([["wl-paste", "--no-newline"], ["xclip", "-selection", "clipboard", "-o"], ["xsel", "--clipboard", "--output"]])}
    if op == "clipboard_set":
        run_tool([["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]], str(request.get("text", "")))
        return {}
    raise Failure("unknown_op", 'Unknown request "%s".' % op)


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except Exception:
            reply(None, False, {"code": "bad_request", "error": "Could not read the request."})
            continue
        try:
            reply(request.get("id"), True, handle(request))
        except Failure as failure:
            reply(request.get("id"), False, {"code": failure.code, "error": failure.message})
        except Exception as error:
            reply(request.get("id"), False, {"code": "error", "error": "%s: %s" % (type(error).__name__, error)})


if __name__ == "__main__":
    main()
