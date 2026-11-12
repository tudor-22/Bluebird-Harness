// drag x1 y1 x2 y2 [holdMs] : real drag (screenshot-frame coords 1388x868 on the built-in display), with dragged events and a hold before release
import Foundation
import CoreGraphics
var ids = [CGDirectDisplayID](repeating: 0, count: 8); var n: UInt32 = 0
CGGetActiveDisplayList(8, &ids, &n)
let d = ids.prefix(Int(n)).first { CGDisplayIsBuiltin($0) != 0 } ?? CGMainDisplayID()
let b = CGDisplayBounds(d)
let a = CommandLine.arguments.compactMap { Double($0) }
guard a.count >= 4 else { print("usage"); exit(1) }
func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: b.origin.x + x / 1388.0 * b.width, y: b.origin.y + y / 868.0 * b.height) }
let p0 = pt(a[0], a[1]), p1 = pt(a[2], a[3]); let hold = a.count > 4 ? useconds_t(a[4] * 1000) : 1500000
func post(_ t: CGEventType, _ p: CGPoint) { CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap) }
post(.mouseMoved, p0); usleep(200000)
post(.leftMouseDown, p0); usleep(250000)
let steps = 40
for i in 1...steps {
  let t = Double(i) / Double(steps), e = t * t * (3 - 2 * t)
  post(.leftMouseDragged, CGPoint(x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e)); usleep(25000)
}
usleep(hold)
post(.leftMouseUp, p1)
print("dragged")
