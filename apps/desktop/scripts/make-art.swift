// Draws the app icon and the installer window's background from the Bluebird logo.
// Usage: swiftc -O scripts/make-art.swift -o /tmp/make-art && /tmp/make-art <logo.png> <build dir>
import AppKit

let args = CommandLine.arguments
guard args.count == 3, let logo = NSImage(contentsOfFile: args[1]) else { fatalError("usage: make-art logo.png outdir") }
let out = args[2]

func png(_ size: NSSize, scale: CGFloat = 1, draw: () -> Void) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width * scale), pixelsHigh: Int(size.height * scale), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = size
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high
    draw()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

// The logo has a white margin; crop to the bird so it can be sized properly.
func cropped(_ image: NSImage) -> NSImage {
    guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil), let data = cg.dataProvider?.data, let bytes = CFDataGetBytePtr(data) else { return image }
    let w = cg.width, h = cg.height, bpp = cg.bitsPerPixel / 8
    var minX = w, minY = h, maxX = 0, maxY = 0
    for y in 0..<h { for x in 0..<w {
        let p = y * cg.bytesPerRow + x * bpp
        if Int(bytes[p]) + Int(bytes[p + 1]) + Int(bytes[p + 2]) < 600 { minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y) }
    } }
    let rect = CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
    guard let piece = cg.cropping(to: rect) else { return image }
    return NSImage(cgImage: piece, size: NSSize(width: rect.width, height: rect.height))
}
// The logo is blue on white: turn the white into transparency, so the bird sits cleanly on any tile.
func masked(_ image: NSImage) -> NSImage {
    guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return image }
    let rep = NSBitmapImageRep(cgImage: cg)
    let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: rep.pixelsWide, pixelsHigh: rep.pixelsHigh, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    for y in 0..<rep.pixelsHigh { for x in 0..<rep.pixelsWide {
        let c = rep.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
        let alpha = min(1, max(0, (1 - c.redComponent) * 1.04))
        out.setColor(NSColor(deviceRed: 0, green: 95.0 / 255, blue: 192.0 / 255, alpha: alpha < 0.03 ? 0 : alpha), atX: x, y: y)
    } }
    let result = NSImage(size: NSSize(width: rep.pixelsWide, height: rep.pixelsHigh))
    result.addRepresentation(out)
    return result
}
let bird = masked(cropped(logo))

// Icon: macOS squircle tile, soft white to pale blue, the bird centred.
let icon = png(NSSize(width: 1024, height: 1024)) {
    let tile = NSRect(x: 100, y: 100, width: 824, height: 824)
    let path = NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185)
    NSGraphicsContext.current?.saveGraphicsState()
    let shadow = NSShadow(); shadow.shadowColor = NSColor(white: 0, alpha: 0.28); shadow.shadowBlurRadius = 24; shadow.shadowOffset = NSSize(width: 0, height: -10)
    shadow.set(); NSColor.white.setFill(); path.fill()
    NSGraphicsContext.current?.restoreGraphicsState()
    NSGradient(starting: NSColor(calibratedRed: 0.99, green: 0.995, blue: 1, alpha: 1), ending: NSColor(calibratedRed: 0.86, green: 0.92, blue: 0.99, alpha: 1))!.draw(in: path, angle: -90)
    let target = tile.height * 0.62
    let scale = min(target / bird.size.width, target / bird.size.height)
    let size = NSSize(width: bird.size.width * scale, height: bird.size.height * scale)
    bird.draw(in: NSRect(x: tile.midX - size.width / 2, y: tile.midY - size.height / 2, width: size.width, height: size.height))
}
try icon.write(to: URL(fileURLWithPath: "\(out)/icon-1024.png"))

// Installer window: 540 x 380 points, drawn at 2x.
func background(scale: CGFloat) -> Data {
    png(NSSize(width: 540, height: 380), scale: scale) {
        NSGradient(starting: NSColor(calibratedRed: 0.97, green: 0.98, blue: 1, alpha: 1), ending: NSColor(calibratedRed: 0.90, green: 0.94, blue: 0.99, alpha: 1))!.draw(in: NSRect(x: 0, y: 0, width: 540, height: 380), angle: -90)
        let title = NSAttributedString(string: "Install Bluebird", attributes: [.font: NSFont.systemFont(ofSize: 22, weight: .semibold), .foregroundColor: NSColor(calibratedWhite: 0.12, alpha: 1)])
        title.draw(at: NSPoint(x: 270 - title.size().width / 2, y: 318))
        let sub = NSAttributedString(string: "Drag Bluebird into Applications", attributes: [.font: NSFont.systemFont(ofSize: 13), .foregroundColor: NSColor(calibratedWhite: 0.42, alpha: 1)])
        sub.draw(at: NSPoint(x: 270 - sub.size().width / 2, y: 294))
        // An arrow between the two icons (icons sit at x = 150 and 390, y = 175 from the top).
        let blue = NSColor(calibratedRed: 0.18, green: 0.44, blue: 0.84, alpha: 1)
        blue.setStroke()
        let arrow = NSBezierPath(); arrow.lineWidth = 3.5; arrow.lineCapStyle = .round; arrow.lineJoinStyle = .round
        arrow.move(to: NSPoint(x: 215, y: 205)); arrow.line(to: NSPoint(x: 325, y: 205))
        arrow.move(to: NSPoint(x: 305, y: 225)); arrow.line(to: NSPoint(x: 328, y: 205)); arrow.line(to: NSPoint(x: 305, y: 185))
        arrow.stroke()
        let foot = NSAttributedString(string: "First launch: right-click Bluebird and choose Open.", attributes: [.font: NSFont.systemFont(ofSize: 11.5), .foregroundColor: NSColor(calibratedWhite: 0.5, alpha: 1)])
        foot.draw(at: NSPoint(x: 270 - foot.size().width / 2, y: 36))
    }
}
try background(scale: 1).write(to: URL(fileURLWithPath: "\(out)/dmg-background.png"))
try background(scale: 2).write(to: URL(fileURLWithPath: "\(out)/dmg-background@2x.png"))
print("done")
