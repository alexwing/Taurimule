import os
import subprocess
import time
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
ICONS_DIR = os.path.join(PROJECT_ROOT, "src-tauri", "icons")
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "public")

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not os.path.exists(EDGE_PATH):
    EDGE_PATH = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"

def render_svg_to_png(svg_path, out_png, size=512):
    with open(svg_path, "r", encoding="utf-8") as f:
        svg_content = f.read()

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{
    width: {size}px;
    height: {size}px;
    background: transparent !important;
    overflow: hidden;
  }}
  .container {{
    width: {size}px;
    height: {size}px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  svg {{
    width: 100%;
    height: 100%;
  }}
</style>
</head>
<body>
  <div class="container">
    {svg_content}
  </div>
</body>
</html>"""
    
    temp_html = os.path.join(SCRIPT_DIR, "temp_render.html")
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    cmd = [
        EDGE_PATH,
        "--headless=new",
        "--hide-scrollbars",
        "--enable-logging=stderr",
        "--default-background-color=00000000",
        f"--window-size={size},{size}",
        f"--screenshot={out_png}",
        f"file:///{temp_html.replace(os.sep, '/')}"
    ]
    subprocess.run(cmd, check=True)
    if os.path.exists(temp_html):
        os.remove(temp_html)
    print(f"Rendered {out_png} ({size}x{size})")

def main():
    os.makedirs(ICONS_DIR, exist_ok=True)
    
    # 1. Render base 512x512 from logo-connected.svg
    base_512 = os.path.join(ICONS_DIR, "icon-512.png")
    render_svg_to_png(os.path.join(PUBLIC_DIR, "logo-connected.svg"), base_512, 512)

    im512 = Image.open(base_512).convert("RGBA")

    # 2. Generate icon.png (512x512)
    im512.save(os.path.join(ICONS_DIR, "icon.png"), "PNG")
    
    # 3. Generate standard Tauri sizes
    sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }

    for name, s in sizes.items():
        resized = im512.resize((s, s), Image.Resampling.LANCZOS)
        resized.save(os.path.join(ICONS_DIR, name), "PNG")
        print(f"Generated {name} ({s}x{s})")

    # 4. Generate multi-resolution icon.ico for Windows
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_path = os.path.join(ICONS_DIR, "icon.ico")
    im512.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"Generated multi-resolution {ico_path}")

    # 5. Generate tray icons (32x32) for the 4 states with crisp rendering
    tray_states = {
        "tray-active.png": "logo-connected.svg",
        "tray-downloading.png": "logo-downloading.svg",
        "tray-warning.png": "logo-warning.svg",
        "tray-idle.png": "logo-idle.svg",
    }
    for tray_name, svg_file in tray_states.items():
        temp_render = os.path.join(SCRIPT_DIR, "temp_tray.png")
        render_svg_to_png(os.path.join(PUBLIC_DIR, svg_file), temp_render, 128)
        t_im = Image.open(temp_render).convert("RGBA")
        t_32 = t_im.resize((32, 32), Image.Resampling.LANCZOS)
        t_32.save(os.path.join(ICONS_DIR, tray_name), "PNG")
        if os.path.exists(temp_render):
            os.remove(temp_render)
        print(f"Generated crisp tray icon: {tray_name}")

    if os.path.exists(base_512):
        os.remove(base_512)
    print("All icons successfully generated!")

if __name__ == "__main__":
    main()
