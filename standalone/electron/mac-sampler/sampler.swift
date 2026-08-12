// pandion-color-sampler (punch list t4-143): the macOS system color
// sampler, as a tiny CLI the desktop app spawns.
//
// NSColorSampler is Apple's sanctioned picking service - the same live
// magnifier the system color panel uses. The SYSTEM draws the loupe and
// hands the app exactly ONE color, so it is exempt from the Screen
// Recording permission that gates whole-screen capture (Torry's
// observation: Chromium's dropper - jamovi's included - needs no
// permission; this is why). Chromium itself implements the web
// EyeDropper API with NSColorSampler on macOS.
//
// Protocol: prints "#rrggbb" and exits 0 on a pick; prints "cancel" and
// exits 0 when the user dismisses the loupe (Escape); anything else is
// a failure the caller treats as "fall back to the capture overlay".
import Cocoa

// No dock icon, no menu bar takeover: this process is invisible apart
// from the system loupe it summons.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let sampler = NSColorSampler()
sampler.show { picked in
    if let c = picked?.usingColorSpace(.sRGB) {
        let r = Int((c.redComponent * 255).rounded())
        let g = Int((c.greenComponent * 255).rounded())
        let b = Int((c.blueComponent * 255).rounded())
        print(String(format: "#%02x%02x%02x", r, g, b))
    } else {
        print("cancel")
    }
    exit(0)
}
app.run()
