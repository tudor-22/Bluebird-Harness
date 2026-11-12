// winrec: record ONE window (works on any Space) to .mov via ScreenCaptureKit.
// usage: winrec <windowID> <out.mov> [fps]   (stop with SIGINT)
import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia
import AppKit

func log(_ s: String) { FileHandle.standardError.write(Data((s + "\n").utf8)) }

final class Rec: NSObject, SCStreamOutput, SCStreamDelegate {
  var writer: AVAssetWriter!
  var input: AVAssetWriterInput!
  var started = false
  func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of t: SCStreamOutputType) {
    guard t == .screen, sb.isValid, CMSampleBufferGetNumSamples(sb) == 1,
      let a = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
      let raw = a.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
    if !started { writer.startWriting(); writer.startSession(atSourceTime: sb.presentationTimeStamp); started = true }
    if input.isReadyForMoreMediaData { input.append(sb) }
  }
  func stream(_ s: SCStream, didStopWithError e: Error) { log("stream stopped: \(e)"); exit(2) }
}

_ = NSApplication.shared
var keep: [Any] = []
let args = CommandLine.arguments
guard args.count >= 3, let wid = UInt32(args[1]) else { log("usage: winrec <windowID> <out.mov> [fps]"); exit(1) }
let fps = args.count > 3 ? Int(args[3]) ?? 30 : 30
let url = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: url)

Task {
  do {
    log("looking up window")
    let c = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let w = c.windows.first(where: { $0.windowID == wid }) else { log("window not found"); exit(1) }
    let cfg = SCStreamConfiguration()
    let W = (Int(w.frame.width) * 2) & ~1, H = (Int(w.frame.height) * 2) & ~1
    cfg.width = W; cfg.height = H
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
    cfg.pixelFormat = kCVPixelFormatType_32BGRA
    cfg.showsCursor = true
    cfg.queueDepth = 6
    let r = Rec()
    r.writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    r.input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000]])
    r.input.expectsMediaDataInRealTime = true
    r.writer.add(r.input)
    let s = SCStream(filter: SCContentFilter(desktopIndependentWindow: w), configuration: cfg, delegate: r)
    try s.addStreamOutput(r, type: .screen, sampleHandlerQueue: DispatchQueue(label: "rec"))
    try await s.startCapture()
    log("recording \(W)x\(H) -> \(url.path)")
    signal(SIGINT, SIG_IGN); signal(SIGTERM, SIG_IGN)
    let stop: () -> Void = {
      Task {
        try? await s.stopCapture()
        r.input.markAsFinished()
        await r.writer.finishWriting()
        log("saved")
        exit(0)
      }
    }
    let a = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    let b = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    a.setEventHandler(handler: stop); b.setEventHandler(handler: stop)
    a.resume(); b.resume()
    keep = [a, b, s, r]
  } catch { log("error: \(error)"); exit(1) }
}
RunLoop.main.run()
