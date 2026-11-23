"""Play the buy-coat branch through the street controls and reload its checkpoints."""
import json
import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

url = os.environ.get('STREET_URL', 'http://127.0.0.1:4290').rstrip('/')
out = Path('output/shopping-chess')
out.mkdir(parents=True, exist_ok=True)
world_key = 'mgoi-neighborhood-v1'

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True, args=[
        '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
    ])
    page = browser.new_page(viewport={'width': 1040, 'height': 690})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_default_timeout(90000)
    expect.set_options(timeout=90000)

    def inspect_renderer(route):
        source = route.fetch().text()
        anchor = ' function render({x,y,z,heading,pitch}){'
        assert source.count(anchor) == 1
        # Read the actual posed model, including inherited visibility of its meshes.
        observe = """ window.readShoppingActors=()=>{
         const q=actors.get('aqing').model,l=actors.get('ling').model,materials=[];
         q.traverseVisible(part=>{
          if(part.isMesh)for(const mat of [part.material].flat())materials.push(mat.name);
         });
         return {qing:q.position.toArray(),ling:l.position.toArray(),visible:q.visible,
          heading:q.rotation.y,materials:[...new Set(materials)]};
        };
        """
        route.fulfill(body=source.replace(anchor, observe+anchor), content_type='text/javascript')

    page.route('**/street-render.js', inspect_renderer)
    def world():
        return page.evaluate('k=>JSON.parse(localStorage.getItem(k))', world_key)

    def action(name):
        return page.locator('[data-street-action="'+name+'"]')

    def wait_flag(name):
        page.wait_for_function('(flag)=>JSON.parse(localStorage.getItem("mgoi-neighborhood-v1"))?.flags.includes(flag)', arg=name)

    def screenshot(name):
        page.screenshot(path=str(out/(name+'.jpg')), type='jpeg', quality=91)

    def confirm_counter(reference):
        actor = page.evaluate('readShoppingActors()')
        assert actor['visible']
        for name in ['qing','ling']:
            assert all(abs(a-b)<.06 for a,b in zip(reference[name], actor[name])), (reference, actor)
        return actor

    def resume_at_shop():
        page.reload()
        page.locator('.vinyl-continue').click()
        page.wait_for_function("typeof readShoppingActors==='function' && !document.querySelector('.street-dialogue').hidden")
        expect(page.locator('.street-speaker')).to_have_text(re.compile('玲姐|阿晴'))

    goal = page.locator('#street-goal')
    buttons = page.locator('.street-actions [data-street-action]:visible')
    page.goto(url+'/?street=3d')
    page.locator('.vinyl-new').click()
    page.locator('[data-learning-mode="experienced"]').click()
    action('go-out').click()
    action('coat-start').click()
    interact = page.locator('#street-interact')
    expect(interact).to_have_text(re.compile('芳姐'), timeout=330000)
    interact.click()
    action('shop-check').click()
    action('show-coat').click()
    action('coat-route-buy').click()
    page.locator('#street-close').click()
    page.locator('#street-follow').click()
    expect(page.locator('#street-follow')).not_to_have_text('自己走', timeout=330000)
    expect(interact).to_have_text(re.compile('玲姐|阿晴'))
    interact.click()
    expect(action('coat-quote')).to_be_enabled()
    wallet = world()['money']
    opening = page.evaluate('readShoppingActors()')
    screenshot('01-arrive')
    # Save this real arrival to record an uninterrupted take separately from the reload checks.
    (out/'shopping-arrival-save.json').write_text(json.dumps(page.evaluate(
        'Object.fromEntries(Object.entries(localStorage).filter(([k])=>/mgoi-neighborhood-v1|learning-guide/.test(k)))'
    ), ensure_ascii=False), encoding='utf8')
    action('coat-quote').click()
    wait_flag('coat-quoted')
    assert 'qing-paid-coat' not in world()['flags']
    resume_at_shop()
    expect(goal).to_contain_text('试穿')
    expect(action('coat-review')).not_to_be_visible()
    quoted = confirm_counter(opening)
    assert quoted['materials'] == opening['materials']
    assert world()['money'] == wallet

    wait_flag('coat-fitted')
    expect(buttons).to_have_text(['看起来不错'])
    fitted = page.evaluate('readShoppingActors()')
    assert fitted['visible'] and any('celadon' in material.lower() for material in fitted['materials']), fitted
    screenshot('02-ready-for-review')
    resume_at_shop()
    expect(buttons).to_have_text(['看起来不错'])
    expect(goal).to_contain_text('评价')
    resumed = confirm_counter(fitted)
    assert resumed['materials'] == fitted['materials']

    action('coat-review').click()
    wait_flag('coat-reviewed')
    reviewed = world()
    assert 'qing-paid-coat' not in reviewed['flags'] and reviewed['money'] == wallet
    resume_at_shop()
    expect(action('coat-review')).not_to_be_visible()
    expect(page.locator('.street-line')).to_have_text('好，就呢件。')
    wait_flag('qing-paid-coat')
    assert world()['money'] == wallet
    after_pay = world()
    resume_at_shop()
    expect(action('coat-emergency')).to_be_enabled()
    expect(action('coat-review')).not_to_be_visible()
    expect(action('coat-quote')).not_to_be_visible()
    expect(goal).to_contain_text('面试')
    paid = world()
    assert paid['flags'].count('qing-paid-coat') == 1
    assert sum('自己付了 HK$80' in note for note in paid['notes']) == 1
    assert paid['items'] == after_pay['items'] and paid['money'] == wallet
    assert paid['notes'] == after_pay['notes']
    paid_actor = confirm_counter(fitted)
    assert paid_actor['materials'] == fitted['materials']
    screenshot('03-paid-resumed')
    action('coat-emergency').click()
    expect(page.locator('#street-close')).to_have_text('送阿晴出发')
    page.locator('#street-close').click()
    expect(goal).to_contain_text('阿明')
    assert page.evaluate("readShoppingActors().visible") is False
    assert world()['coatOutcome'] == 'emergency' and world()['money'] == wallet
    assert not errors, errors
    print('PASS buy route, four refreshes, single purchase, outfit, positions, wallet and send-off', flush=True)
    (out/'buy-resume-check.json').write_text(json.dumps({
        'walletBefore':wallet,'walletAfter':world()['money'],'stageFlags':paid['flags'],
        'opening':opening,'afterQuotedReload':quoted,'fitted':fitted,'afterFittedReload':resumed,'afterPaidReload':paid_actor,
    }, ensure_ascii=False, indent=2), encoding='utf8')
    browser.close()
