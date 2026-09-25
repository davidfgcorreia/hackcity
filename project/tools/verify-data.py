"""Check the /data decision map in a browser against the running stack, read-only.

    docker run --rm --network host \
      -v "$PWD/tools:/tools:ro" -v /tmp/hackcity-data-review:/out \
      hackcity-shots python /tools/verify-data.py

It asserts that grid squares are drawn, a square and a ranked candidate open their drill-down with
Laya's evaluation, the live balance card does not report a false "0 of N" before a benchmark exists,
the Live view shows its mode, the Bird map draws the abandonment heat cloud, the field page's Home
button returns to /, and the PT/EN switch changes labels. The station-target PUT is intercepted, so nothing is written. Screenshots go to /out.
"""
import os
import re

from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
OUT = "/out"
HASH = "#Decision%20map"

# Count canvas pixels in the blue sequential ramp (grid squares), excluding green stations and yellow stops.
BLUE_PIXELS = """() => {
  const canvas = document.querySelector('.leaflet-overlay-pane canvas')
  if (!canvas) return { count: 0 }
  const { width, height } = canvas, data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const rect = canvas.getBoundingClientRect()
  let count = 0, x0 = null, y0 = null
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (a > 150 && b > 150 && b - r > 60 && b - g > 20) {
      count++
      if (x0 == null) { const p = i / 4; x0 = p % width; y0 = Math.floor(p / width) }
    }
  }
  return { count, x: x0 == null ? null : rect.left + x0 * rect.width / width, y: y0 == null ? null : rect.top + y0 * rect.height / height }
}"""


def shot(page, name, full=False):
    page.screenshot(path=f"{OUT}/{name}.png", full_page=full)
    print(f"{OUT}/{name}.png")


def settle(page):
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("**/api/stations/*/target", lambda route: route.fulfill(status=200, json={}))

        # Grid only, so blue pixels can come from squares alone.
        page.goto(f"{WEB}/data?layers=grid{HASH}")
        settle(page)
        blue = page.evaluate(BLUE_PIXELS)
        assert blue["count"] > 500, f"grid squares not drawn: {blue}"
        page.mouse.click(blue["x"] + 2, blue["y"] + 2)
        page.wait_for_selector(".decision-detail .decision-card >> text=/Quadrícula|Square/", timeout=5000)
        page.wait_for_selector(".decision-detail .decision-card svg", timeout=8000)  # hourly profile chart
        shot(page, "01-grid-cell-drilldown")

        # Default layers: candidate table row selects and highlights.
        page.goto(f"{WEB}/data{HASH}")
        settle(page)
        page.locator(".decision-table tbody tr").first.click()
        page.wait_for_selector(".decision-table tbody tr.on")
        page.wait_for_selector(".decision-detail .decision-card >> text=/Candidat[oe] #1/")
        # Laya: its columns in the 250 m ranking and its evaluation in the selected candidate's card.
        page.wait_for_selector(".decision-table th >> text=Laya #")
        page.wait_for_selector(".decision-detail .decision-laya", timeout=8000)
        page.locator(".decision-table tbody tr").nth(1).click()
        page.wait_for_selector(".decision-compare-table")
        assert "cand=" in page.url, page.url
        page.wait_for_timeout(1000)
        shot(page, "02-candidates-compare", full=True)

        # The shared URL restores the same selection.
        shared = page.url
        page.goto(shared)
        settle(page)
        assert page.locator(".decision-table tbody tr.on").count() == 2

        # Language switch.
        page.goto(f"{WEB}/data{HASH}")
        settle(page)
        assert page.locator("h2").first.inner_text() == "Mapa de decisão de mobilidade"
        page.locator(".appbar-lang").click()
        assert page.locator("h2").first.inner_text() == "Mobility decision map"

        # Analysis tab deep link: the tab's selected candidate opens selected on the map.
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)  # fresh page: PT default
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{WEB}/data#Station%20candidates")
        settle(page)
        page.wait_for_selector("text=Final analysis", timeout=15000)  # the Laya section still renders
        shot(page, "07-candidates-tab", full=True)
        page.get_by_role("button", name="Abrir no mapa →").first.click()
        page.wait_for_selector(".decision-table tbody tr.on")
        assert "cand=" in page.url and page.url.endswith(HASH), page.url

        # Bird performance tab; the former #Recovery link still reaches it.
        page.goto(f"{WEB}/data#Recovery")
        settle(page)
        page.wait_for_selector("text=Abandonos (penalizáveis)", timeout=15000)
        page.wait_for_selector("text=Relocalizações para estações abaixo do habitual")
        assert page.url.endswith("#Bird"), page.url
        # Hotspots are on by default: leaflet.heat draws its own canvas.
        page.wait_for_selector("canvas.leaflet-heatmap-layer", timeout=8000)
        assert page.get_by_role("button", name="Relocalizações da Bird").count() == 0
        assert page.get_by_role("button", name="Estações: horas vazias").count() == 0  # lives in the performance view
        live = page.get_by_role("button", name=re.compile("Abandonadas agora"))
        if live.is_enabled():
            live.click()
        page.wait_for_timeout(1500)
        shot(page, "08-bird", full=True)
        # Station score view: multi-colour band markers, histogram and best/worst tables.
        page.get_by_role("tab", name="Desempenho por estação").click()
        page.wait_for_selector("text=Distribuição das pontuações")
        page.wait_for_selector("text=Melhores estações")
        shot(page, "09-bird-score", full=True)
        page.get_by_role("button", name="Estações: horas vazias").click()
        page.wait_for_selector("text=Nunca ficou vazia")
        shot(page, "09b-bird-empty-hours")

        # Live: balance card must not show a false 0-of-N before 7 days of snapshots.
        page.goto(f"{WEB}/data?view=live{HASH}")
        settle(page)
        balance = page.locator(".decision-card", has_text="Equilíbrio das estações agora").inner_text()
        assert "aguardam" in balance or not balance.split("\n")[1].startswith("0 de"), balance
        page.wait_for_selector("text=/● Tempo real|^Replay$/")
        shot(page, "03-live", full=True)

        page.get_by_role("button", name="Fontes e definições").click()
        page.wait_for_selector(".decision-drawer tbody tr")
        shot(page, "04-sources")

        mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        mobile.on("pageerror", lambda error: errors.append(str(error)))
        mobile.goto(f"{WEB}/data?cell=-437_-427{HASH}")
        settle(mobile)
        mobile.wait_for_selector(".decision-detail.has-selection .decision-card svg", timeout=8000)
        shot(mobile, "05-mobile-cell")
        mobile.goto(f"{WEB}/data{HASH}")
        settle(mobile)
        shot(mobile, "06-mobile", full=True)

        # One app bar on / and /data; the old floating nav is gone.
        page.goto(f"{WEB}/")
        page.wait_for_selector(".appbar >> text=Análise de dados")
        page.wait_for_selector(".home-stat >> text=Abandonadas agora")
        shot(page, "10-home")
        page.get_by_role("link", name="Análise de dados").first.click()
        page.wait_for_url(re.compile(r".*/data.*"))

        # Field page: Home is always reachable (read-only: just navigation).
        page.goto(f"{WEB}/field")
        page.get_by_role("button", name="Início").click()
        page.wait_for_url(f"{WEB}/")

        assert not errors, errors
        browser.close()
        print("data map checks passed")


if __name__ == "__main__":
    main()
