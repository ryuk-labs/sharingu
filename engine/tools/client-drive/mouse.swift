// mouse.swift — `mouse click|move <x> <y>`: one CGEvent left click (or a move) at a point of the main screen, in points.
// `System Events click at` hangs on Electron apps (ChatGPT, Claude); a posted CGEvent does not. It needs the
// Accessibility grant, so it runs inside Terminal (run-in-terminal.sh). Built by build.sh into .runs/client-drive/bin/.
import CoreGraphics
import Foundation

let a = CommandLine.arguments
guard a.count == 4, ["click", "move"].contains(a[1]), let x = Double(a[2]), let y = Double(a[3]) else {
  FileHandle.standardError.write("usage: mouse click|move <x> <y>\n".data(using: .utf8)!)
  exit(2)
}
let p = CGPoint(x: x, y: y)
func post(_ t: CGEventType) { CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap) }
post(.mouseMoved)
if a[1] == "click" {
  usleep(80_000); post(.leftMouseDown); usleep(60_000); post(.leftMouseUp)
}
