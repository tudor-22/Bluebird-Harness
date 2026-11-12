// Bluebird's own dictation for the Mac app: the microphone through Apple's speech recognition,
// on this computer whenever the system supports it. Talks to the app in JSON lines on stdout and
// listens for "stop" on stdin.
//   {"type":"partial","text":"hello wor"}  the words so far
//   {"type":"final","text":"hello world"}  a finished phrase
//   {"type":"error","error":"not-allowed"} permission refused, no microphone, unsupported, or the like
//   {"type":"end"}                          the session is over
import AVFoundation
import Foundation
import Speech

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

func finish(_ code: Int32 = 0) -> Never {
    emit(["type": "end"])
    exit(code)
}

func fail(_ error: String) -> Never {
    emit(["type": "error", "error": error])
    finish(1)
}

let identifier = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : Locale.current.identifier
guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: identifier)) ?? SFSpeechRecognizer(), recognizer.isAvailable else { fail("language-not-supported") }

let engine = AVAudioEngine()
var request: SFSpeechAudioBufferRecognitionRequest?
var task: SFSpeechRecognitionTask?
var stopping = false
var lastPartial = ""
var quickFailures = 0
var startedAt = Date()

func listen() {
    let current = SFSpeechAudioBufferRecognitionRequest()
    current.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition { current.requiresOnDeviceRecognition = true }
    request = current
    startedAt = Date()
    lastPartial = ""
    task = recognizer.recognitionTask(with: current) { result, error in
        DispatchQueue.main.async {
            if let result = result {
                let text = result.bestTranscription.formattedString
                if result.isFinal {
                    if !text.isEmpty { emit(["type": "final", "text": text]) }
                    lastPartial = ""
                    quickFailures = 0
                    if stopping { finish() } else { listen() }
                } else if !text.isEmpty {
                    lastPartial = text
                    emit(["type": "partial", "text": text])
                }
                return
            }
            guard error != nil else { return }
            // A task ends with an error on silence or a time limit: keep what was heard and listen again.
            if !lastPartial.isEmpty { emit(["type": "final", "text": lastPartial]); lastPartial = "" }
            if stopping { finish() }
            quickFailures = Date().timeIntervalSince(startedAt) < 1.5 ? quickFailures + 1 : 0
            if quickFailures >= 3 { fail("no-speech") }
            listen()
        }
    }
}

func begin() {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0 else { fail("audio-capture") }
    input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in request?.append(buffer) }
    engine.prepare()
    do { try engine.start() } catch { fail("audio-capture") }
    listen()
    emit(["type": "ready"])
}

func stop() {
    if stopping { return }
    stopping = true
    engine.stop()
    engine.inputNode.removeTap(onBus: 0)
    request?.endAudio()
    // The last words arrive as a final result; do not wait forever for them.
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
        if !lastPartial.isEmpty { emit(["type": "final", "text": lastPartial]) }
        finish()
    }
}

// Commands from the app: "stop", or the app going away.
Thread.detachNewThread {
    while let line = readLine() {
        if line.trimmingCharacters(in: .whitespacesAndNewlines) == "stop" { break }
    }
    DispatchQueue.main.async { stop() }
}

SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard status == .authorized else { fail("not-allowed") }
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            DispatchQueue.main.async {
                guard granted else { fail("not-allowed") }
                begin()
            }
        }
    }
}

RunLoop.main.run()
