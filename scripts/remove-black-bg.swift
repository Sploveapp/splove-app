#!/usr/bin/env swift
import AppKit

/// Supprime les pixels très sombres (fond noir) → alpha 0, exporte PNG RGBA.
let args = CommandLine.arguments
guard args.count >= 3 else {
    fputs("Usage: remove-black-bg.swift <input.jpg|png> <output.png>\n", stderr)
    exit(1)
}
let inPath = args[1]
let outPath = args[2]

guard let img = NSImage(contentsOfFile: inPath) else {
    fputs("Impossible de charger l’image.\n", stderr)
    exit(1)
}

var rect = NSRect(origin: .zero, size: img.size)
guard let cgImage = img.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    fputs("Pas de CGImage.\n", stderr)
    exit(1)
}

let w = cgImage.width
let h = cgImage.height
let bpp = 4
let rowBytes = w * bpp
var raw = [UInt8](repeating: 0, count: h * rowBytes)

guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { exit(1) }
let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue

guard let ctx = CGContext(
    data: &raw,
    width: w,
    height: h,
    bitsPerComponent: 8,
    bytesPerRow: rowBytes,
    space: colorSpace,
    bitmapInfo: bitmapInfo
) else {
    fputs("CGContext impossible.\n", stderr)
    exit(1)
}

ctx.translateBy(x: 0, y: CGFloat(h))
ctx.scaleBy(x: 1, y: -1)
ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: w, height: h))

/// Seuil : fond noir pur + légers artefacts JPEG (évite d’attaquer le magenta foncé du cœur).
let darkMax: UInt8 = 38

for y in 0..<h {
    for x in 0..<w {
        let i = (y * w + x) * bpp
        let r = raw[i]
        let g = raw[i + 1]
        let b = raw[i + 2]
        let m = max(r, max(g, b))
        if m < darkMax {
            raw[i] = 0
            raw[i + 1] = 0
            raw[i + 2] = 0
            raw[i + 3] = 0
        } else {
            raw[i + 3] = 255
        }
    }
}

guard let outCtx = CGContext(
    data: &raw,
    width: w,
    height: h,
    bitsPerComponent: 8,
    bytesPerRow: rowBytes,
    space: colorSpace,
    bitmapInfo: bitmapInfo
),
    let outCG = outCtx.makeImage() else {
    fputs("Export impossible.\n", stderr)
    exit(1)
}

let rep = NSBitmapImageRep(cgImage: outCG)
guard let pngData = rep.representation(using: .png, properties: [:]) else {
    fputs("PNG impossible.\n", stderr)
    exit(1)
}

do {
    try pngData.write(to: URL(fileURLWithPath: outPath))
} catch {
    fputs("Écriture: \(error)\n", stderr)
    exit(1)
}

print("OK → \(outPath)")
