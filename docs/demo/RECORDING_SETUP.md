# AIDE Memory: Recording Setup Guide

This guide covers tools, terminal settings, screen dimensions, and conversion workflows for creating high-quality demo recordings and GIFs.

---

## Screen Recording Tools

### macOS: Built-in Screenshot App (Recommended for Simplicity)

**Pros:**
- Zero setup, always available
- High quality, no compression
- Supports variable frame rates
- File output is straightforward

**How to use:**
1. Press `Cmd+Shift+5` to open Screenshot app
2. Click "Record" or "Record Selected Portion"
3. Start recording your screen
4. Stop by clicking the Stop button in menu bar or press `Cmd+Control+Esc`
5. Output is saved as `.mov` or `.mp4` file on desktop

**Settings:**
- Choose "Entire Screen" or "Selected Window" (Cmd+Shift+5 → Options)
- Set quality to "Maximum" (if available in preferences)

### macOS: OBS Studio (Recommended for Professional Results)

**Pros:**
- Advanced scene management
- Can separate narration track (add audio in post)
- More encoding options
- Free and open-source

**How to set up:**
1. Download OBS from https://obsproject.com/ (free)
2. Open OBS and create a new Scene
3. Add a Display Capture source
4. Set output resolution (see "Window Dimensions" below)
5. Go to Settings > Output > Recording
   - Set format to `.mp4`
   - Set encoder to `Hardware (Apple VideoToolbox)` for Mac
6. Click "Start Recording" in the main window
7. Perform your demo
8. Click "Stop Recording" when done

**OBS Settings for Best Results:**
- Base canvas: 1920x1080 or 1280x720 (see below for smaller)
- Output resolution: 1280x720 (for smaller file sizes and faster GIFs)
- Encoder: Apple VideoToolbox (H.264, efficient on Mac)
- Bitrate: 5000–8000 kbps (high quality)
- Framerate: 30 fps (good balance for GIFs and file size)

### Alternative: Cursor's Built-in Recording

If using Cursor as the main window being recorded, Cursor has screenshot capability via `Cmd+Shift+2`. However, for full-screen terminal demos, the above tools are more practical.

---

## Terminal Settings for Recording

### Font & Size
- **Font:** SF Mono, Monaco, or Fira Code (monospaced)
- **Size:** 16pt minimum (18pt preferred for 1920x1080 recording)
- **Line height:** 1.2–1.5 (comfortable spacing)

### Colors & Theme
- **Background:** Dark theme recommended (less harsh on viewers, professional appearance)
  - macOS Terminal: "Pro" or "Novel" theme
  - iTerm2: Dracula, Nord, or One Dark theme
- **Text:** Light gray or white (#CCCCCC or #FFFFFF recommended)
- **Cursor:** Highlight or blinking (stands out in recording)

### Shell Prompt
- Keep the prompt short and clear
- Example:
  ```
  $ 
  ```
  or
  ```
  demo@project ~ % 
  ```
- Avoid long Git/Node status lines (slow to render on screen)
- If using a fancy prompt (Starship, Oh My Zsh), disable it for recording:
  ```bash
  export PS1="$ "
  ```

### Window Configuration
- **Width:** 80–120 columns (commands fit on one line without wrapping)
- **Height:** 24–30 rows (enough to show command output without scrolling)
- **Resize before recording:** Terminal size affects readability in GIF
  ```bash
  # For reference, standard dimensions:
  # 80x24 = classic terminal
  # 120x40 = more space for longer output
  ```

---

## Screen Dimensions for Recording

Choose based on your target platform and GIF file size.

### Option 1: 1920x1080 (Full HD)
- **Use case:** High-quality recordings for website headers, full-page embeds
- **GIF output:** Largest file size; reduce to 1280x720 after recording
- **Pros:** Crisp, professional
- **Cons:** Larger files, slower GIF generation

### Option 2: 1280x720 (HD)
- **Use case:** Most common web embeds, social media
- **GIF output:** Moderate file size (10–20 MB range)
- **Pros:** Balanced quality and file size
- **Cons:** May need 16pt terminal font for readability

### Option 3: 960x540 (qHD)
- **Use case:** Inline embeds, smaller space on page
- **GIF output:** Small file size (5–10 MB)
- **Pros:** Fast load, low bandwidth
- **Cons:** Text may be hard to read; use 14pt+ font

### Recommended Setup for AIDE Memory Demos
- **Recording size:** 1920x1080
- **Terminal font size:** 18pt
- **Framerate:** 30 fps
- **Convert GIF to:** 1280x720 or 960x540 depending on embed

---

## Converting Recordings to GIFs

### Option 1: Using `ffmpeg` (Command Line)

**Install ffmpeg:**
```bash
# macOS
brew install ffmpeg

# Or use HomeBrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install ffmpeg
```

**Basic Conversion (1280x720, 10 fps, optimized):**
```bash
ffmpeg -i recording.mov \
  -vf "scale=1280:720" \
  -r 10 \
  -f gif \
  output.gif
```

**Parameters explained:**
- `-i recording.mov` — input file
- `-vf "scale=1280:720"` — resize to 1280x720
- `-r 10` — reduce framerate to 10 fps (cuts file size, preserves visibility)
- `-f gif` — output format
- `output.gif` — output filename

**Advanced: Optimize File Size with Palette**
```bash
# Step 1: Generate a palette from the video
ffmpeg -i recording.mov \
  -vf "scale=1280:720,fps=10,palettegen" \
  -y palette.png

# Step 2: Use the palette to create optimized GIF
ffmpeg -i recording.mov \
  -i palette.png \
  -lavfi "scale=1280:720,fps=10[v];[v][1:v]paletteuse" \
  -y output.gif
```

This two-step process creates significantly smaller GIFs (30–40% reduction).

### Option 2: Using `gifski` (Recommended for Quality)

**Install gifski:**
```bash
brew install gifski
```

**Convert to GIF:**
```bash
ffmpeg -i recording.mov -r 10 frames_%04d.png
gifski -o output.gif frames_*.png --fps 10
rm frames_*.png
```

**Or in one command (gifski with ffmpeg pipe):**
```bash
ffmpeg -i recording.mov -r 10 -f image2pipe -c:v ppm - | \
  gifski -o output.gif --fps 10
```

**gifski Advantages:**
- Superior color handling
- Smaller file sizes than ffmpeg GIFs
- Higher quality for text and UI

### Option 3: Using ScreenFloat or GIFS.com (GUI Tools)

**ScreenFloat (macOS App):**
- Convert .mov to GIF with drag-and-drop
- Supports compression and optimization
- ~$20 (available on App Store)

**GIFs.com (Web-based):**
- Upload .mp4 or .mov
- Configure size, fps, duration
- Download optimized GIF
- Free tier available

---

## Recommended GIF Specifications

### For README and Landing Page Headers
- **Dimensions:** 1280x720 or 960x540
- **Framerate:** 10–15 fps (smooth but compact)
- **Target file size:** 8–15 MB
- **Duration:** 15–50 seconds (each demo)
- **Loop:** Yes (infinite)

### For Inline Embeds (Smaller Spaces)
- **Dimensions:** 800x450 or 640x360
- **Framerate:** 8–10 fps
- **Target file size:** 4–8 MB
- **Duration:** 10–20 seconds

### For Social Media (Twitter, LinkedIn)
- **Dimensions:** 1200x675 (16:9 aspect ratio)
- **Framerate:** 15 fps
- **Target file size:** 15 MB max
- **Duration:** 10–30 seconds

---

## Recording Checklist

Before you hit Record:

- [ ] Terminal font size: 16pt or larger
- [ ] Terminal theme: Dark mode
- [ ] Screen resolution: 1920x1080 (or chosen resolution)
- [ ] Shell prompt: Simple (no Git clutter)
- [ ] ffmpeg or gifski: Installed and tested
- [ ] Project initialized: `.aide/` directory exists
- [ ] Terminal clear: No previous output visible
- [ ] Recording tool: Positioned and ready
- [ ] Narration: Written out (if recording separately)
- [ ] Test run: Do one practice run before the actual recording

---

## Post-Production Workflow

### Step 1: Review Raw Recording
- Play back `.mov` file to check:
  - Audio quality (if recorded together)
  - Pacing and timing
  - Any errors or typos
  - Terminal output readability

### Step 2: Trim if Needed
```bash
# Trim first 2 seconds and last 3 seconds
ffmpeg -i recording.mov \
  -ss 2 \
  -to 47 \
  -c copy \
  recording_trimmed.mov
```

### Step 3: Add Narration (Optional, Separate Audio Track)
If recording narration separately:
1. Record narration as `.m4a` or `.wav`
2. Use ffmpeg to merge video + audio:
```bash
ffmpeg -i recording.mov \
  -i narration.m4a \
  -c:v copy \
  -c:a aac \
  recording_with_audio.mov
```

### Step 4: Convert to GIF
```bash
# Using the palette method (highest quality):
ffmpeg -i recording_with_audio.mov \
  -vf "scale=1280:720,fps=10,palettegen" \
  -y palette.png

ffmpeg -i recording_with_audio.mov \
  -i palette.png \
  -lavfi "scale=1280:720,fps=10[v];[v][1:v]paletteuse" \
  -y demo-sequence-1.gif
```

### Step 5: Verify Output
```bash
# Check file size
ls -lh demo-sequence-1.gif

# Play in browser or viewer to confirm quality
open demo-sequence-1.gif
```

---

## File Naming Convention

Use consistent, descriptive names for final assets:

```
demo-1-init.gif
demo-2-remember.gif
demo-3-recall.gif
demo-4-scoping.gif
demo-5-correction.gif
demo-6-persistence.gif
demo-7-full-flow.gif

# Or with descriptive names:
demo-init-project.gif
demo-store-memory-cli.gif
demo-recall-hook.gif
demo-path-scoping.gif
demo-correction-capture.gif
demo-cross-session.gif
demo-end-to-end.gif
```

Store all final GIFs in: `/docs/assets/demo-gifs/`

---

## Troubleshooting

### GIF is Too Large (>20 MB)
- Reduce framerate: `-r 5` instead of `-r 10`
- Reduce resolution: `scale=960:540` instead of `1280:720`
- Increase duration between key actions (less animation = smaller file)
- Use `gifski` instead of ffmpeg (typically 30–40% smaller)

### GIF is Blurry
- Increase ffmpeg framerate: `-r 15` instead of `-r 10`
- Use `gifski` (superior color handling)
- Use palette generation method (better color matching)
- Try original size before resizing

### Text is Hard to Read
- Increase terminal font to 18pt or 20pt
- Use lighter terminal theme (e.g., Solarized Light for light backgrounds)
- Avoid thin fonts (Monaco is better than SF Mono for this)

### Recording Tool Freezes
- Close unnecessary apps (free up memory)
- Reset OBS (File > Exit, relaunch)
- Use simpler recording settings (lower bitrate, lower fps)
- Try built-in Screenshot app instead of OBS

---

## Example Complete Workflow

```bash
# 1. Record on Mac (using Screenshot app or OBS)
# Output: recording.mov

# 2. Check file
ls -lh recording.mov  # e.g., 80 MB

# 3. Generate palette
ffmpeg -i recording.mov \
  -vf "scale=1280:720,fps=10,palettegen" \
  -y palette.png

# 4. Create optimized GIF
ffmpeg -i recording.mov \
  -i palette.png \
  -lavfi "scale=1280:720,fps=10[v];[v][1:v]paletteuse" \
  -y demo-init.gif

# 5. Verify output
ls -lh demo-init.gif  # e.g., 12 MB
open demo-init.gif    # test in viewer

# 6. Move to docs
mv demo-init.gif docs/assets/demo-gifs/
```

Done! The GIF is ready to embed.
