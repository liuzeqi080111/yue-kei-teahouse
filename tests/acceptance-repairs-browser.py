"""Exercise the reported street regressions through normal player controls."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = root / "output/repairs"
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        channel="msedge", headless=True,
        args=["--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
    )
    page = browser.new_page(viewport={"width":1376, "height":850})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    # Read-only observation of actual runtime state, without changing player state.
    def observe_game(route):
        source = route.fetch().text()
        source = source.replace(
            "function frame(now){",
            "window.reviewView=()=>({...current,y:cameraY,mode:travel.snapshot().mode});function frame(now){",
        )
        route.fulfill(body=source, content_type="text/javascript")
    def observe_scene(route):
        source = route.fetch().text().replace(
            "return {reunion,speak,layout,actors",
            "window.reviewActors=()=>Object.fromEntries([...actors].map(([id,a])=>[id,a.model.position.toArray()]));return {reunion,speak,layout,actors",
        )
        route.fulfill(body=source, content_type="text/javascript")
    page.route("**/street-game.js", observe_game)
    page.route("**/street-render.js", observe_scene)
    def observe_props(route):
        source=route.fetch().text().replace(
            ' return (point,engaged,now)=>{',
            " window.reviewProps=()=>({coatOnCounter:!!kit.coatShown,qingHeld:jobs.find(j=>j.id==='aqing').left.visible});return (point,engaged,now)=>{",
        )
        route.fulfill(body=source,content_type='text/javascript')
    page.route('**/street-fixtures.js',observe_props)
    page.goto("http://127.0.0.1:4236/?street=3d")
    page.locator(".vinyl-new").click()
    page.locator('[data-learning-mode="experienced"]').click()
    page.locator('[data-street-action="go-out"]').click(timeout=90000)
    page.wait_for_timeout(1500)
    page.screenshot(path=str(out / "qing-final.jpg"))
    before = page.evaluate("reviewActors()")
    page.locator('[data-street-action="coat-start"]').click()
    page.wait_for_timeout(1500)
    before_drag = page.evaluate("reviewView()")
    page.mouse.move(620, 250)
    page.mouse.down()
    page.mouse.move(780, 280, steps=12)
    page.mouse.up()
    start = page.evaluate("reviewView()")
    assert abs(start["heading"]-before_drag["heading"]) > .3, (before_drag, start, page.evaluate("document.elementFromPoint(620,250).outerHTML.slice(0,300)"))
    page.wait_for_timeout(1800)
    end = page.evaluate("reviewView()")
    assert start["mode"] == end["mode"] == "following", (start, end)
    assert abs(end["heading"] - start["heading"]) < .001, (start, end)
    assert abs(end["pitch"] - start["pitch"]) < .001, (start, end)
    assert abs(end["x"]-start["x"]) + abs(end["z"]-start["z"]) > .1
    moved=set()
    samples=[]
    for _ in range(480):
        page.wait_for_timeout(250)
        view=page.evaluate("reviewView()")
        after=page.evaluate("reviewActors()")
        moved.update(name for name in ('buyer','regular','ale','ling') if sum(abs(x-y) for x,y in zip(before[name],after[name]))>.05)
        samples.append(view)
        if view['mode']!='following':break
        assert abs(view['heading']-start['heading'])<.001,view
        assert abs(view['pitch']-start['pitch'])<.001,view
        assert abs(view['y']-start['y'])<.001,view
    assert samples[-1]['mode']=='arrived',samples[-1]
    assert len(moved)==4,sorted(moved)
    page.screenshot(path=str(out / "follow-final.jpg"))
    page.locator('#street-interact').click()
    page.locator('[data-street-action="shop-check"]').click(timeout=15000)
    page.locator('[data-street-action="show-coat"]:not([disabled])').wait_for(timeout=60000)
    page.locator('[data-street-action="show-coat"]').click()
    page.wait_for_timeout(1200)
    props=page.evaluate('reviewProps()')
    assert props=={'coatOnCounter':True,'qingHeld':False},props
    page.screenshot(path=str(out/'counter-final.jpg'))
    assert not errors, errors
    (out / "street-regressions.json").write_text(
        json.dumps({"start":start,"end":end,"arrival":samples[-1],"followSamples":len(samples),"movingNPCs":sorted(moved),"errors":errors},indent=2),
        encoding="utf-8",
    )
    browser.close()
print("PASS stable free-look during following and four moving neighbours")
