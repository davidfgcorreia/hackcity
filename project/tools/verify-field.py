"""Exercise field navigation against the running web app without changing live cases.

    docker run --rm --network host \
      -v "$PWD/tools:/tools:ro" -v /tmp/hackcity-field-review:/out \
      hackcity-shots python /tools/verify-field.py

GETs use the running stack. Playwright intercepts the replan and pickup POSTs so the
screenshots and assertions cannot change the shared operational database.
"""
import copy
import json
import os
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

WEB = "http://localhost:5173"
API = "http://localhost:8000/api"
OUT = "/out"


def get(path):
    with urlopen(API + path, timeout=10) as response:
        return json.load(response)


def screenshot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png")
    print(f"{OUT}/{name}.png")


def main():
    os.makedirs(OUT, exist_ok=True)
    mission = get("/missions/current?operator_id=op1")
    assert mission and mission["routing_engine"] == "osrm", "op1 needs an active road mission"
    first = next(s for s in mission["stops"] if s["status"] == "planned" and s["kind"] == "pickup")
    assert first["case_id"] in {c["id"] for c in get("/cases")}
    start_lng, start_lat = mission["route_geojson"]["coordinates"][0]

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1,
                                      color_scheme="dark")  # presentation must remain light
        context.grant_permissions(["geolocation"])
        context.set_geolocation({"latitude": start_lat, "longitude": start_lng, "accuracy": 5})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def pickup(route):
            assert route.request.method == "POST"
            body = route.request.post_data_buffer or b""
            assert b"picked_up" in body and b"photo" in body
            pickup.called = True
            updated = copy.deepcopy(mission)
            updated["version"] += 1
            updated["last_change"] = "bike picked up — next target updated"
            for stop in updated["stops"]:
                if stop["id"] == first["id"]:
                    stop["status"] = "done"
                    stop["outcome"] = "picked_up"
            route.fulfill(status=200, content_type="application/json", body=json.dumps(updated))

        pickup.called = False
        page.route(f"**/api/stops/{first['id']}/outcome", pickup)
        page.goto(WEB + "/field", wait_until="domcontentloaded")
        page.get_by_role("button", name="Cheguei").wait_for(timeout=20_000)
        page.wait_for_timeout(2500)
        assert page.evaluate("getComputedStyle(document.documentElement).colorScheme") == "light"
        assert page.evaluate("getComputedStyle(document.querySelector('.field-root')).backgroundColor") == "rgb(242, 242, 247)"
        screenshot(page, "field-peek")
        grabber = page.locator('[aria-label="drag"]')
        grabber.click()
        page.wait_for_timeout(450)
        screenshot(page, "field-half")
        grabber.click()
        page.wait_for_timeout(450)
        screenshot(page, "field-full")

        page.get_by_role("button", name="Cheguei").click()
        page.locator('input[type="file"]').set_input_files({
            "name": "pickup.png", "mimeType": "image/png",
            "buffer": bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082"),
        })
        page.get_by_role("button", name="Recolhida", exact=True).click()
        page.get_by_text("Registado", exact=True).wait_for(timeout=10_000)
        assert pickup.called, "pickup request was not sent"
        screenshot(page, "field-pickup-confirmed")

        reroutes = []

        def replan(route):
            body = route.request.post_data_json
            reroutes.append(body)
            updated = copy.deepcopy(mission)
            if body.get("reason") == "off_route":
                updated["version"] += 1
                updated["last_change"] = "Off route — new route to bike; next: bike"
            route.fulfill(status=200, content_type="application/json", body=json.dumps(updated))

        page.route("**/api/missions/replan", replan)
        # Let the regular GET poll replace the intercepted pickup response before moving GPS.
        page.wait_for_timeout(5500)
        with page.expect_response("**/api/missions/replan"):
            page.get_by_role("button", name="Recalcular").click()
        assert reroutes and not reroutes[0].get("reason"), "manual replan was not sent"
        grabber.click()  # full -> peek, so the route-change notice stays visible
        context.set_geolocation({"latitude": start_lat + 0.01, "longitude": start_lng + 0.01, "accuracy": 5})
        page.wait_for_timeout(21_000)  # 8 seconds off-route, then the remainder of the 20-second cooldown
        assert any(body.get("reason") == "off_route" for body in reroutes), f"off-route replan missing: {reroutes}"
        assert any("Rota alterada" in text and "Off route" in text
                   for text in page.locator('[role="status"]').all_text_contents())
        screenshot(page, "field-off-route")
        assert not errors, f"browser errors: {errors}"
        print("PASS: peek, half, full, pickup request, and off-route replan")
        browser.close()


if __name__ == "__main__":
    main()
