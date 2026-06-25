# TopNetGraph

TopNetGraph is a GNOME Shell extension that displays a live network traffic graph in the top panel.

## Features
- Shows upload and download activity in real time
- Displays a compact graph directly in the panel
- Includes a popup menu with current traffic statistics
- Supports configurable update interval, graph style, and interface selection

## Compatibility
- GNOME Shell 45
- GNOME Shell 46

The extension has been updated to work correctly with GNOME Shell 46 by using the supported GJS/GIO async file-loading API for reading system network statistics.

## Installation

### 1. Install the extension files
1. Clone this repository or download it as a ZIP archive.
2. Copy the extension folder to your GNOME Shell extensions directory:
   - `~/.local/share/gnome-shell/extensions/`
3. Make sure the folder name matches the UUID declared in the extension metadata, which is `topnetgraph@rohitkr150015.github.io`.

### 2. Compile the GSettings schema
From the extension directory, run:

```bash
glib-compile-schemas schemas
```

### 3. Enable the extension
1. Restart GNOME Shell or log out and log back in.
2. Open the Extensions app.
3. Find “TopNetGraph” and turn it on.

### 4. Configure it
After enabling the extension, open the extension preferences to adjust:
- graph type
- update interval
- network interface
- whether to show upload/download traffic

### 5. Troubleshooting
If the extension does not appear:
- confirm the folder is placed in `~/.local/share/gnome-shell/extensions/`
- verify the UUID matches the metadata
- ensure the schema was compiled successfully
- check the Logs panel or run `journalctl -f` for GNOME Shell errors

## Recent code changes
- Replaced the older async file-read approach with the callback-based `Gio.File.load_contents_async()` / `load_contents_finish()` flow for better compatibility with modern GNOME Shell/GJS.
- Kept the extension’s settings and UI logic intact while preserving the existing network monitoring behavior.
- Verified the extension schema compiles successfully.

## Notes
- The extension monitors traffic from `/proc/net/dev` and displays the combined activity for the selected interface or all active interfaces.
- If you want to monitor a specific interface, set it in the extension preferences.
