import Foundation
import ScreenCaptureKit
import AppKit
import ImageIO
import UniformTypeIdentifiers
_ = NSApplication.shared
let a = CommandLine.arguments
guard a.count >= 3, let wid = UInt32(a[1]) else { print("usage: winsnap <windowID> <out.png> [scale 0-1]"); exit(1) }
let sc = a.count > 3 ? Double(a[3]) ?? 0.5 : 0.5
Task {
  do {
    let c = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let w = c.windows.first(where: { $0.windowID == wid }) else { print("window not found"); exit(1) }
    let cfg = SCStreamConfiguration()
    cfg.width = Int(w.frame.width * 2 * sc); cfg.height = Int(w.frame.height * 2 * sc)
    let img = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: w), configuration: cfg)
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, img, nil); CGImageDestinationFinalize(d)
    print("ok \(img.width)x\(img.height)"); exit(0)
  } catch { print("error \(error)"); exit(1) }
}
RunLoop.main.run()
