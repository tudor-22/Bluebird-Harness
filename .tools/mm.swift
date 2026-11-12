// mm x y [steps] : smoothly move the real mouse to (x,y) given in the 1388x868 screenshot frame of the built-in display
import Foundation
import CoreGraphics
var ids = [CGDirectDisplayID](repeating: 0, count: 8); var n: UInt32 = 0
CGGetActiveDisplayList(8, &ids, &n)
let d = ids.prefix(Int(n)).first { CGDisplayIsBuiltin($0) != 0 } ?? CGMainDisplayID()
let b = CGDisplayBounds(d)
let a = CommandLine.arguments
guard a.count >= 3, let x = Double(a[1]), let y = Double(a[2]) else { print("bounds \(b)"); exit(0) }
let steps = a.count > 3 ? Int(a[3]) ?? 12 : 12
let tx = b.origin.x + x / 1388.0 * b.width, ty = b.origin.y + y / 868.0 * b.height
let cur = CGEvent(source: nil)!.location
for i in 1...steps {
  let t = Double(i) / Double(steps), e = t * t * (3 - 2 * t)
  let p = CGPoint(x: cur.x + (tx - cur.x) * e, y: cur.y + (ty - cur.y) * e)
  CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
  usleep(16000)
}
print("moved to \(tx),\(ty) bounds \(b)")
