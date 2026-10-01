// Local Apple Vision OCR bridge. Stdout contains only JSON word observations.
// Input may be the original image or a crop prepared by the batch reader.
import Foundation
import ImageIO
import Vision
import Darwin

struct Word: Encodable {
    let t: String
    let x: Double
    let r: Double
    let y: Double
    let b: Double
    let h: Double
    let cx: Double
    let cy: Double
    let conf: Double
}

enum OCRFailure: Error, CustomStringConvertible {
    case message(String)
    var description: String {
        switch self { case .message(let message): return message }
    }
}

func recognize(path: String) throws -> [Word] {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw OCRFailure.message("Could not decode the input image")
    }
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let rawOrientation = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: rawOrientation) ?? .up
    let rotated = [.left, .leftMirrored, .right, .rightMirrored].contains(orientation)
    let width = Double(rotated ? image.height : image.width)
    let height = Double(rotated ? image.width : image.height)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try handler.perform([request])

    let whitespaceWords = try NSRegularExpression(pattern: "\\S+")
    var words: [Word] = []
    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else {
            throw OCRFailure.message("A detected text observation had no recognition candidate")
        }
        let text = candidate.string
        for match in whitespaceWords.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let range = Range(match.range, in: text),
                  let rectangle = try candidate.boundingBox(for: range) else {
                throw OCRFailure.message("Could not obtain a word bounding box")
            }
            // Vision uses normalized bottom-left coordinates. The parser uses
            // pixel coordinates measured from the image's top-left corner.
            let box = rectangle.boundingBox
            let x = Double(box.minX) * width
            let right = Double(box.maxX) * width
            let y = (1 - Double(box.maxY)) * height
            let bottom = (1 - Double(box.minY)) * height
            words.append(Word(t: String(text[range]), x: x, r: right, y: y,
                              b: bottom, h: bottom - y, cx: (x + right) / 2,
                              cy: (y + bottom) / 2,
                              conf: Double(candidate.confidence) * 100))
        }
    }
    return words
}

do {
    guard CommandLine.arguments.count == 2 else {
        throw OCRFailure.message("Usage: vision_ocr <image-path>")
    }
    let words = try recognize(path: CommandLine.arguments[1])
    let encoded = try JSONEncoder().encode(words)
    FileHandle.standardOutput.write(encoded)
    FileHandle.standardOutput.write(Data([10]))
} catch {
    // Do not include filenames or OCR content in errors: a filename can contain
    // a character name. The caller owns screenshot-specific reporting.
    let message: String
    if let failure = error as? OCRFailure { message = failure.description }
    else { message = "Apple Vision OCR failed (code \((error as NSError).code))" }
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
