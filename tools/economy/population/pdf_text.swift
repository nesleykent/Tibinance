// Prints the text of a PDF (macOS PDFKit). Used to read snapshots of public pages saved as PDF by hand.
//   swift tools/economy/population/pdf_text.swift <file.pdf>
import PDFKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let doc = PDFDocument(url: url) else { exit(1) }
print(doc.string ?? "")
