// Bluebird's macOS accessibility helper.
//
// A long-running process: Bluebird writes one JSON request per line on stdin and reads one JSON
// answer per line on stdout. Unlike a one-shot command, it keeps the live accessibility elements it
// found in memory, so a numbered mark from the last outline points at exactly that element until the
// next outline replaces the table.
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

// MARK: - JSON line protocol

typealias JSON = [String: Any]

func reply(_ id: Any?, ok: Bool, _ body: JSON) {
    var out: JSON = ["ok": ok]
    if let id = id { out["id"] = id }
    for (key, value) in body { out[key] = value }
    if let data = try? JSONSerialization.data(withJSONObject: out, options: []),
       var line = String(data: data, encoding: .utf8) {
        line.append("\n")
        FileHandle.standardOutput.write(line.data(using: .utf8)!)
    }
}

struct Failure: Error { let code: String; let message: String }

// MARK: - Element table

struct Held {
    let element: AXUIElement
    let pid: pid_t
    let role: String
    let title: String
}

var table: [Int: Held] = [:]
var generation = 0

let attributeBatch: [String] = [
    kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute,
    kAXEnabledAttribute, kAXFocusedAttribute, kAXSelectedAttribute, kAXHelpAttribute,
    kAXPlaceholderValueAttribute, kAXIdentifierAttribute, kAXChildrenAttribute, kAXPositionAttribute, kAXSizeAttribute,
]

func string(_ value: Any?) -> String {
    if let text = value as? String { return text }
    if let number = value as? NSNumber { return number.stringValue }
    return ""
}

func attributes(_ element: AXUIElement) -> [String: Any] {
    var out: [String: Any] = [:]
    var values: CFArray?
    let status = AXUIElementCopyMultipleAttributeValues(element, attributeBatch as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values)
    guard status == .success, let list = values as? [Any] else { return out }
    for (index, name) in attributeBatch.enumerated() where index < list.count {
        let value = list[index]
        // Missing attributes come back as AXError placeholders, which are not NSString/NSNumber/NSArray.
        if CFGetTypeID(value as CFTypeRef) == AXValueGetTypeID() {
            let wrapped = value as! AXValue
            if AXValueGetType(wrapped) == .cgPoint {
                var point = CGPoint.zero
                AXValueGetValue(wrapped, .cgPoint, &point)
                out[name] = point
            } else if AXValueGetType(wrapped) == .cgSize {
                var size = CGSize.zero
                AXValueGetValue(wrapped, .cgSize, &size)
                out[name] = size
            }
        } else if value is String || value is NSNumber || value is [AXUIElement] || value is NSArray {
            out[name] = value
        }
    }
    return out
}

func friendlyRole(_ role: String, _ subrole: String) -> String {
    switch role {
    case "AXButton": return subrole == "AXCloseButton" ? "close-button" : "button"
    case "AXPopUpButton": return "popup"
    case "AXMenuButton": return "menu-button"
    case "AXCheckBox": return "checkbox"
    case "AXRadioButton": return "radio"
    case "AXTextField": return subrole == "AXSearchField" ? "searchfield" : "textfield"
    case "AXTextArea": return "textarea"
    case "AXComboBox": return "combobox"
    case "AXSlider": return "slider"
    case "AXIncrementor", "AXStepper": return "stepper"
    case "AXLink": return "link"
    case "AXMenuItem": return "menuitem"
    case "AXMenuBarItem": return "menubaritem"
    case "AXMenu": return "menu"
    case "AXMenuBar": return "menubar"
    case "AXTabGroup": return "tabs"
    case "AXRow": return "row"
    case "AXCell": return "cell"
    case "AXOutline": return "outline"
    case "AXTable": return "table"
    case "AXList": return "list"
    case "AXScrollArea": return "scrollarea"
    case "AXToolbar": return "toolbar"
    case "AXWindow": return "window"
    case "AXSheet": return "sheet"
    case "AXGroup", "AXSplitGroup", "AXLayoutArea", "AXLayoutItem": return "group"
    case "AXStaticText": return "text"
    case "AXImage": return "image"
    case "AXDisclosureTriangle": return "disclosure"
    case "AXColorWell": return "colorwell"
    case "AXWebArea": return "web"
    case "AXHeading": return "heading"
    default: return role.hasPrefix("AX") ? String(role.dropFirst(2)).lowercased() : role.lowercased()
    }
}

let actionable: Set<String> = [
    "AXButton", "AXPopUpButton", "AXMenuButton", "AXCheckBox", "AXRadioButton", "AXTextField", "AXTextArea",
    "AXComboBox", "AXSlider", "AXIncrementor", "AXStepper", "AXLink", "AXMenuItem", "AXMenuBarItem",
    "AXDisclosureTriangle", "AXColorWell", "AXTabButton",
]
let structural: Set<String> = ["AXGroup", "AXSplitGroup", "AXLayoutArea", "AXLayoutItem", "AXUnknown", "AXScrollArea", "AXSplitter", "AXValueIndicator"]

// MARK: - Applications and windows

func runningApps() -> [NSRunningApplication] {
    NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular || $0.activationPolicy == .accessory }
}

func findApp(_ query: String) throws -> NSRunningApplication {
    let wanted = query.lowercased()
    let apps = runningApps()
    if let pid = Int32(query), let app = apps.first(where: { $0.processIdentifier == pid }) { return app }
    if let exact = apps.first(where: { ($0.localizedName ?? "").lowercased() == wanted || ($0.bundleIdentifier ?? "").lowercased() == wanted }) { return exact }
    let partial = apps.filter { ($0.localizedName ?? "").lowercased().contains(wanted) || ($0.bundleIdentifier ?? "").lowercased().contains(wanted) }
    if partial.count == 1 { return partial[0] }
    if partial.count > 1 {
        throw Failure(code: "ambiguous_app", message: "\"\(query)\" matches several apps: " + partial.compactMap { $0.localizedName }.joined(separator: ", ") + ". Use the exact name or the bundle id.")
    }
    throw Failure(code: "no_app", message: "No running app matches \"\(query)\". Use desktop_open to launch it.")
}

func appElement(_ app: NSRunningApplication) -> AXUIElement {
    let element = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(element, 1.5)
    // Chromium and Electron apps only build their accessibility tree when asked.
    AXUIElementSetAttributeValue(element, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    AXUIElementSetAttributeValue(element, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
    return element
}

func children(_ element: AXUIElement, _ attrs: [String: Any]) -> [AXUIElement] {
    if let list = attrs[kAXChildrenAttribute] as? [AXUIElement] { return list }
    return []
}

func windowList(for pid: pid_t) -> [AXUIElement] {
    let element = AXUIElementCreateApplication(pid)
    var value: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXWindowsAttribute as CFString, &value) == .success, let list = value as? [AXUIElement] { return list }
    return []
}

func describeWindow(_ window: AXUIElement, index: Int) -> JSON {
    let a = attributes(window)
    var out: JSON = ["index": index, "title": string(a[kAXTitleAttribute])]
    if let p = a[kAXPositionAttribute] as? CGPoint, let s = a[kAXSizeAttribute] as? CGSize {
        out["x"] = Int(p.x); out["y"] = Int(p.y); out["width"] = Int(s.width); out["height"] = Int(s.height)
    }
    return out
}

// MARK: - Outline

struct OutlineLimits { var maxNodes: Int; var maxDepth: Int; var actionsOnly: Bool }

func clip(_ text: String, _ length: Int) -> String {
    let flat = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespaces)
    return flat.count > length ? String(flat.prefix(length - 1)) + "…" : flat
}

func buildOutline(root: AXUIElement, pid: pid_t, startMark: Int, limits: OutlineLimits) -> (lines: [String], truncated: Bool) {
    var lines: [String] = []
    var visited = 0
    var truncated = false
    var mark = startMark

    func visit(_ element: AXUIElement, _ depth: Int) {
        if truncated { return }
        if visited >= limits.maxNodes { truncated = true; return }
        visited += 1
        AXUIElementSetMessagingTimeout(element, 1.0)
        let a = attributes(element)
        let role = string(a[kAXRoleAttribute])
        let subrole = string(a[kAXSubroleAttribute])
        let title = string(a[kAXTitleAttribute])
        let desc = string(a[kAXDescriptionAttribute])
        let value = string(a[kAXValueAttribute])
        let placeholder = string(a[kAXPlaceholderValueAttribute])
        let label = !title.isEmpty ? title : (!desc.isEmpty ? desc : placeholder)
        let enabled = (a[kAXEnabledAttribute] as? NSNumber)?.boolValue ?? true
        let focused = (a[kAXFocusedAttribute] as? NSNumber)?.boolValue ?? false
        let selected = (a[kAXSelectedAttribute] as? NSNumber)?.boolValue ?? false
        let kids = children(element, a)

        let name = friendlyRole(role, subrole)
        let isAction = actionable.contains(role) && !(role == "AXTextField" && subrole == "AXSecureTextField" && false)
        var nextDepth = depth

        if isAction {
            table[mark] = Held(element: element, pid: pid, role: role, title: label)
            var line = String(repeating: "  ", count: depth) + "[\(mark)] \(name)"
            if !label.isEmpty { line += " \"\(clip(label, 90))\"" }
            // A secure field's value is never read out.
            if !value.isEmpty && subrole != "AXSecureTextField" && value != label && role != "AXMenuItem" { line += " = \"\(clip(value, 70))\"" }
            if subrole == "AXSecureTextField" { line += " (secure)" }
            var flags: [String] = []
            if (role == "AXCheckBox" || role == "AXRadioButton"), let n = a[kAXValueAttribute] as? NSNumber, n.intValue == 1 { flags.append("checked") }
            if !enabled { flags.append("disabled") }
            if focused { flags.append("focused") }
            if selected { flags.append("selected") }
            if !flags.isEmpty { line += " (" + flags.joined(separator: ", ") + ")" }
            lines.append(line)
            mark += 1
            nextDepth = depth + 1
        } else if role == "AXStaticText" {
            let text = !value.isEmpty ? value : (!title.isEmpty ? title : desc)
            if !text.isEmpty && !limits.actionsOnly { lines.append(String(repeating: "  ", count: depth) + clip(text, 200)) }
            return
        } else if role == "AXHeading" {
            let text = !title.isEmpty ? title : (!value.isEmpty ? value : desc)
            if !text.isEmpty { lines.append(String(repeating: "  ", count: depth) + "# " + clip(text, 120)) }
            return
        } else if !structural.contains(role) {
            // Windows, sheets, toolbars, tables, lists and the like are shown as headings of their part.
            let shown = ["AXWindow", "AXSheet", "AXToolbar", "AXTable", "AXOutline", "AXList", "AXTabGroup", "AXMenuBar", "AXMenu", "AXWebArea"].contains(role)
            if shown && (!limits.actionsOnly || role == "AXWindow" || role == "AXSheet") {
                lines.append(String(repeating: "  ", count: depth) + name + (label.isEmpty ? "" : " \"\(clip(label, 70))\""))
                nextDepth = depth + 1
            } else if role == "AXImage" && !label.isEmpty && !limits.actionsOnly {
                lines.append(String(repeating: "  ", count: depth) + "image \"\(clip(label, 70))\"")
                return
            }
        }
        if depth >= limits.maxDepth { return }
        for child in kids { visit(child, nextDepth) }
    }

    visit(root, 0)
    if truncated { lines.append("[…outline cut here; use desktop_look with a mark or a window to look inside one part]") }
    return (lines, truncated)
}

// MARK: - Input

func post(_ event: CGEvent?, to pid: pid_t?) {
    guard let event = event else { return }
    if let pid = pid { event.postToPid(pid) } else { event.post(tap: .cghidEventTap) }
}

func center(of element: AXUIElement) -> CGPoint? {
    let a = attributes(element)
    guard let p = a[kAXPositionAttribute] as? CGPoint, let s = a[kAXSizeAttribute] as? CGSize, s.width > 0, s.height > 0 else { return nil }
    return CGPoint(x: p.x + s.width / 2, y: p.y + s.height / 2)
}

func mouseClick(at point: CGPoint, button: CGMouseButton = .left, count: Int = 1) {
    let down: CGEventType = button == .left ? .leftMouseDown : .rightMouseDown
    let up: CGEventType = button == .left ? .leftMouseUp : .rightMouseUp
    post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: button), to: nil)
    for n in 1...max(1, count) {
        let d = CGEvent(mouseEventSource: nil, mouseType: down, mouseCursorPosition: point, mouseButton: button)
        d?.setIntegerValueField(.mouseEventClickState, value: Int64(n))
        post(d, to: nil)
        let u = CGEvent(mouseEventSource: nil, mouseType: up, mouseCursorPosition: point, mouseButton: button)
        u?.setIntegerValueField(.mouseEventClickState, value: Int64(n))
        post(u, to: nil)
    }
}

let keyCodes: [String: CGKeyCode] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15,
    "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29,
    "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "return": 36, "enter": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41,
    "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46, ".": 47, "tab": 48, "space": 49, "`": 50, "delete": 51, "backspace": 51,
    "escape": 53, "esc": 53, "left": 123, "right": 124, "down": 125, "up": 126, "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
    "forwarddelete": 117, "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
]

func pressKey(_ spec: String, to pid: pid_t?) throws {
    let parts = spec.lowercased().split(separator: "+").map { String($0).trimmingCharacters(in: .whitespaces) }
    guard let key = parts.last, let code = keyCodes[key] else { throw Failure(code: "bad_key", message: "Unknown key \"\(spec)\".") }
    var flags: CGEventFlags = []
    for modifier in parts.dropLast() {
        switch modifier {
        case "cmd", "command", "meta": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "alt", "option", "opt": flags.insert(.maskAlternate)
        case "ctrl", "control": flags.insert(.maskControl)
        default: throw Failure(code: "bad_key", message: "Unknown modifier \"\(modifier)\". Use cmd, shift, alt or ctrl.")
        }
    }
    for isDown in [true, false] {
        let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: isDown)
        event?.flags = flags
        post(event, to: pid)
    }
}

func typeText(_ text: String, to pid: pid_t?) {
    for scalar in text.unicodeScalars {
        let units = Array(String(scalar).utf16)
        for isDown in [true, false] {
            let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: isDown)
            event?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
            post(event, to: pid)
        }
        usleep(4000)
    }
}

// MARK: - Requests

func held(_ mark: Int) throws -> Held {
    guard let item = table[mark] else {
        throw Failure(code: "no_mark", message: "There is no mark \(mark). Use desktop_look to see the current marks.")
    }
    // The element must still be alive and still be the same kind of thing.
    var value: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(item.element, kAXRoleAttribute as CFString, &value)
    if status != .success || string(value) != item.role {
        throw Failure(code: "stale_mark", message: "That mark is out of date: the window changed. Use desktop_look again.")
    }
    return item
}

func handle(_ request: JSON) throws -> JSON {
    let op = string(request["op"])
    switch op {
    case "status":
        var trusted = AXIsProcessTrusted()
        // Asking shows macOS's own "allow control of this computer" prompt, with a button to open Settings.
        if !trusted, (request["prompt"] as? Bool) == true {
            let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
            trusted = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
        }
        return ["trusted": trusted, "screen": CGPreflightScreenCaptureAccess(), "pid": ProcessInfo.processInfo.processIdentifier, "os": ProcessInfo.processInfo.operatingSystemVersionString]

    case "request_screen":
        return ["granted": CGRequestScreenCaptureAccess()]

    case "apps":
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let list: [JSON] = runningApps().filter { $0.activationPolicy == .regular }.map {
            ["name": $0.localizedName ?? "?", "bundle": $0.bundleIdentifier ?? "", "pid": Int($0.processIdentifier), "frontmost": $0.processIdentifier == front, "hidden": $0.isHidden]
        }
        return ["apps": list]

    case "windows":
        let app = try findApp(string(request["app"]))
        let windows = windowList(for: app.processIdentifier).enumerated().map { describeWindow($0.element, index: $0.offset + 1) }
        return ["app": app.localizedName ?? "", "windows": windows]

    case "outline":
        guard AXIsProcessTrusted() else {
            throw Failure(code: "no_permission", message: "Accessibility access is not allowed for the app running Bluebird. Allow it under System Settings, Privacy & Security, Accessibility, then try again.")
        }
        let app = try findApp(string(request["app"]))
        let appEl = appElement(app)
        var rootEl = appEl
        let title = app.localizedName ?? ""
        if let windowIndex = request["window"] as? Int {
            let windows = windowList(for: app.processIdentifier)
            guard windowIndex >= 1, windowIndex <= windows.count else { throw Failure(code: "no_window", message: "\(title) has \(windows.count) window(s); window \(windowIndex) does not exist.") }
            rootEl = windows[windowIndex - 1]
        }
        if let within = request["within"] as? Int {
            rootEl = try held(within).element
        }
        let limits = OutlineLimits(maxNodes: (request["maxNodes"] as? Int) ?? 500, maxDepth: (request["maxDepth"] as? Int) ?? 14, actionsOnly: (request["actionsOnly"] as? Bool) ?? false)
        table = [:]
        generation += 1
        // The menu bar belongs to the app, not to a window, so it is read on its own when asked.
        var lines: [String] = []
        var truncated = false
        let built = buildOutline(root: rootEl, pid: app.processIdentifier, startMark: 1, limits: limits)
        lines = built.lines
        truncated = built.truncated
        if (request["menus"] as? Bool) == true, request["within"] == nil {
            var barRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(appEl, kAXMenuBarAttribute as CFString, &barRef) == .success, let bar = barRef {
                let more = buildOutline(root: bar as! AXUIElement, pid: app.processIdentifier, startMark: (table.keys.max() ?? 0) + 1, limits: OutlineLimits(maxNodes: 200, maxDepth: 3, actionsOnly: true))
                lines.append("menubar")
                lines.append(contentsOf: more.lines.map { "  " + $0 })
            }
        }
        return ["app": title, "pid": Int(app.processIdentifier), "generation": generation, "marks": table.count, "outline": lines.joined(separator: "\n"), "truncated": truncated]

    case "act":
        let item = try held(Int(string(request["mark"])) ?? -1)
        let action = string(request["action"]).isEmpty ? "AXPress" : string(request["action"])
        let status = AXUIElementPerformAction(item.element, action as CFString)
        if status != .success {
            throw Failure(code: "action_failed", message: "\(item.title.isEmpty ? item.role : item.title) did not accept \(action) (\(status.rawValue)). Try desktop_click with mouse true.")
        }
        return ["did": action]

    case "click":
        var point: CGPoint?
        if let mark = request["mark"] as? Int {
            let item = try held(mark)
            guard let c = center(of: item.element) else { throw Failure(code: "no_frame", message: "That element has no position on screen.") }
            point = c
            if let app = NSRunningApplication(processIdentifier: item.pid) { app.activate(options: []) ; usleep(120_000) }
        } else if let x = request["x"] as? Double, let y = request["y"] as? Double {
            point = CGPoint(x: x, y: y)
        }
        guard let target = point else { throw Failure(code: "no_target", message: "Give a mark or x and y.") }
        let button: CGMouseButton = (request["right"] as? Bool) == true ? .right : .left
        mouseClick(at: target, button: button, count: (request["double"] as? Bool) == true ? 2 : 1)
        return ["x": Int(target.x), "y": Int(target.y)]

    case "set_value":
        let item = try held(Int(string(request["mark"])) ?? -1)
        let text = string(request["text"])
        let status = AXUIElementSetAttributeValue(item.element, kAXValueAttribute as CFString, text as CFString)
        if status != .success { throw Failure(code: "not_settable", message: "That field does not allow its value to be set directly. Use desktop_type instead.") }
        var back: CFTypeRef?
        AXUIElementCopyAttributeValue(item.element, kAXValueAttribute as CFString, &back)
        return ["value": string(back)]

    case "focus":
        let item = try held(Int(string(request["mark"])) ?? -1)
        AXUIElementSetAttributeValue(item.element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        return [:]

    case "type":
        var pid: pid_t?
        if let mark = request["mark"] as? Int {
            let item = try held(mark)
            AXUIElementSetAttributeValue(item.element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
            pid = item.pid
            usleep(80_000)
        } else if let name = request["app"] as? String, !name.isEmpty {
            pid = try findApp(name).processIdentifier
        }
        typeText(string(request["text"]), to: pid)
        return [:]

    case "key":
        var pid: pid_t?
        if let name = request["app"] as? String, !name.isEmpty { pid = try findApp(name).processIdentifier }
        for chord in string(request["keys"]).split(separator: " ") { try pressKey(String(chord), to: pid) ; usleep(30_000) }
        return [:]

    case "scroll":
        var point = CGPoint(x: 400, y: 400)
        if let mark = request["mark"] as? Int, let c = center(of: try held(mark).element) { point = c }
        post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left), to: nil)
        let dy = Int32((request["dy"] as? Int) ?? 0)
        let dx = Int32((request["dx"] as? Int) ?? 0)
        post(CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0), to: nil)
        return [:]

    case "read":
        let item = try held(Int(string(request["mark"])) ?? -1)
        let a = attributes(item.element)
        var out: JSON = ["role": item.role, "title": string(a[kAXTitleAttribute]), "description": string(a[kAXDescriptionAttribute]), "help": string(a[kAXHelpAttribute])]
        var subrole: CFTypeRef?
        AXUIElementCopyAttributeValue(item.element, kAXSubroleAttribute as CFString, &subrole)
        if string(subrole) != "AXSecureTextField" { out["value"] = string(a[kAXValueAttribute]) }
        return out

    case "launch":
        let name = string(request["app"])
        let workspace = NSWorkspace.shared
        if let running = try? findApp(name) { running.activate(options: [.activateAllWindows]); return ["launched": false, "pid": Int(running.processIdentifier)] }
        var url: URL?
        if name.hasPrefix("/") { url = URL(fileURLWithPath: name) }
        else if name.contains(".") { url = workspace.urlForApplication(withBundleIdentifier: name) }
        if url == nil {
            let candidates = ["/Applications/\(name).app", "/System/Applications/\(name).app", "/System/Applications/Utilities/\(name).app", "/Applications/Utilities/\(name).app", NSHomeDirectory() + "/Applications/\(name).app"]
            url = candidates.map { URL(fileURLWithPath: $0) }.first { FileManager.default.fileExists(atPath: $0.path) }
        }
        guard let target = url else { throw Failure(code: "no_app", message: "Could not find an app named \"\(name)\".") }
        let semaphore = DispatchSemaphore(value: 0)
        var pid: Int32 = 0
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        workspace.openApplication(at: target, configuration: configuration) { app, _ in pid = app?.processIdentifier ?? 0; semaphore.signal() }
        _ = semaphore.wait(timeout: .now() + 12)
        return ["launched": true, "pid": Int(pid)]

    case "activate":
        let app = try findApp(string(request["app"]))
        app.activate(options: [.activateAllWindows])
        return [:]

    case "quit":
        let app = try findApp(string(request["app"]))
        let ok = (request["force"] as? Bool) == true ? app.forceTerminate() : app.terminate()
        return ["asked": ok]

    case "window_ids":
        // For screenshots: the on-screen window numbers that belong to an app, largest first.
        let app = try findApp(string(request["app"]))
        let infos = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
        var found: [(Int, Double)] = []
        for info in infos where (info[kCGWindowOwnerPID as String] as? Int32) == app.processIdentifier && (info[kCGWindowLayer as String] as? Int) == 0 {
            let bounds = info[kCGWindowBounds as String] as? [String: Double] ?? [:]
            found.append((info[kCGWindowNumber as String] as? Int ?? 0, (bounds["Width"] ?? 0) * (bounds["Height"] ?? 0)))
        }
        return ["ids": found.sorted { $0.1 > $1.1 }.map { $0.0 }]

    case "clipboard_get":
        return ["text": NSPasteboard.general.string(forType: .string) ?? ""]

    case "clipboard_set":
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(string(request["text"]), forType: .string)
        return [:]

    default:
        throw Failure(code: "unknown_op", message: "Unknown request \"\(op)\".")
    }
}

// MARK: - Own identity

/// macOS grants Accessibility to the "responsible" process, which for a helper started by another
/// program is that program (for Bluebird, `node`). Starting again with the disclaim flag makes this
/// helper its own responsible process, so the permission list shows it by its app bundle's name and
/// icon ("Bluebird"), and the person's switch belongs to Bluebird alone.
var childToStop: pid_t = 0
func relaunchAsOwnResponsibleProcess() {
    if getenv("BLUEBIRD_AX_DISCLAIMED") != nil { return }
    typealias Disclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
    guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim") else { return }
    let disclaim = unsafeBitCast(symbol, to: Disclaim.self)
    var attributes: posix_spawnattr_t? = nil
    guard posix_spawnattr_init(&attributes) == 0 else { return }
    defer { posix_spawnattr_destroy(&attributes) }
    guard disclaim(&attributes, 1) == 0 else { return }
    guard let executable = Bundle.main.executablePath else { return }
    var environment = ProcessInfo.processInfo.environment
    environment["BLUEBIRD_AX_DISCLAIMED"] = "1"
    let envp: [UnsafeMutablePointer<CChar>?] = environment.map { strdup("\($0.key)=\($0.value)") } + [nil]
    let argv: [UnsafeMutablePointer<CChar>?] = [strdup(executable), nil]
    var pid: pid_t = 0
    guard posix_spawn(&pid, executable, nil, &attributes, argv, envp) == 0 else { return }
    childToStop = pid
    // Stopping this process stops the real helper too. Standard input and output pass straight through.
    signal(SIGTERM) { _ in kill(childToStop, SIGTERM); exit(0) }
    signal(SIGINT) { _ in kill(childToStop, SIGTERM); exit(0) }
    var status: Int32 = 0
    waitpid(pid, &status, 0)
    exit((status >> 8) & 0xff)
}
relaunchAsOwnResponsibleProcess()

// MARK: - Main loop

setvbuf(stdout, nil, _IOLBF, 0)
while let line = readLine(strippingNewline: true) {
    guard let data = line.data(using: .utf8), let request = (try? JSONSerialization.jsonObject(with: data)) as? JSON else {
        reply(nil, ok: false, ["code": "bad_request", "error": "Could not read the request."])
        continue
    }
    let id = request["id"]
    do {
        reply(id, ok: true, try handle(request))
    } catch let failure as Failure {
        reply(id, ok: false, ["code": failure.code, "error": failure.message])
    } catch {
        reply(id, ok: false, ["code": "error", "error": "\(error)"])
    }
}
