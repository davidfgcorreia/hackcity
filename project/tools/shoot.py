"""Screenshot app pages for visual review.

    docker run --rm --network host -v $PWD/tools:/tools -v <out>:/out \
      mcr.microsoft.com/playwright/python:v1.55.0-noble python /tools/shoot.py [url#Tab ...]
Prints console errors so broken pages are caught, not just ugly ones.
"""
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
TABS = ["Overview", "Recovery", "Station candidates", "Station flows", "Transit", "Journeys", "Weather", "Data"]
targets = sys.argv[1:] or [f"/insights#{t}" for t in TABS]

with sync_playwright() as p:
    b = p.chromium.launch()
    for i, t in enumerate(targets):
        mobile = t.startswith("m:")
        path = t[2:] if mobile else t
        page = b.new_page(viewport={"width": 390, "height": 844} if mobile else {"width": 1440, "height": 950},
                          device_scale_factor=1)
        errors = []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE + path.replace(" ", "%20"), wait_until="networkidle")
        page.wait_for_timeout(2500)  # map tiles
        name = f"/out/{i:02d}_{path.strip('/').replace('#', '_').replace(' ', '_').replace('/', '_')}{'_m' if mobile else ''}.png"
        page.screenshot(path=name, full_page=True)
        print(name, "errors:", errors[:3] if errors else "none")
        page.close()
    b.close()
