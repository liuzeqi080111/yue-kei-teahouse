"""Walk up to a passing neighbour in a saved street, interrupt, greet and release."""
import os
from math import pi
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('output/pedestrians');out.mkdir(exist_ok=True,parents=True)
url=os.environ.get('STREET_URL','http://127.0.0.1:4290')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',args=['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1100,'height':740})
    errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
    page.on('console',lambda m: errors.append(m.text[:360]) if m.type=='error' else None)
    def observe(route):
        src=route.fetch().text().replace(' return {reunion,speak,layout,actors',""" window.residentPoints=()=>Object.fromEntries(crowd.map(w=>[w.id,w.actor.model.position.toArray()]));
 window.shopReview=()=>visits.map(({id,shop,guest,weights})=>{
  const clerk=character(id).model;
  const depth=(clerk.position.x-shop.x)*shop.sin+(clerk.position.z-shop.z)*shop.cos;
  return {id,depth,present:clerk.visible&&guest.visible&&clerk!==guest,gestures:weights.length};
 });
 window.castFaces=()=>{
  const people=new Map();
  for(const [id,actor] of actors)people.set(actor.model,id);
  for(const visit of visits)if(!people.has(visit.guest))people.set(visit.guest,visit.id+' customer');
  const faces={};
  for(const [model,id] of people){
   let face;
   model.traverse(part=>{
    if(part.morphTargetDictionary?.jawOpen!==undefined&&!part.material?.name?.includes('Oral tissue'))face=part.geometry;
   });
   faces[id]=face?.uuid;
  }
  return faces;
 };
 return {reunion,speak,layout,actors""")
        route.fulfill(body=src,content_type='text/javascript')
    page.route('**/street-render.js',observe)
    def start_at(x,z,heading,flags=(),world_fields=None):
        page.goto(url+'/?street=3d')
        page.evaluate("""async({view,flags,fields})=>{
          const {freshWorld,saveWorld}=await import('./neighborhood-state.js');
          const w=Object.assign(freshWorld(),fields);w.location='street';w.streetView=view;w.flags.push(...flags);
          saveWorld(localStorage,w);
          localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'experienced',showMeaning:true}));
        }""",{'view':{'x':x,'z':z,'heading':heading,'pitch':-.065},'flags':list(flags),'fields':world_fields or {}})
        page.reload();page.locator('.vinyl-continue').click()
    start_at(11.00,6.98,.18)
    target=page.locator('#street-interact').filter(has_text='散步的欣姨')
    target.wait_for(timeout=90000);page.screenshot(path=str(out/'approach.jpg'))
    page.keyboard.press('e');page.locator('[data-street-action="greet-neighbour"]').wait_for(timeout=10000)
    before=page.evaluate('residentPoints()')
    page.locator('[data-street-action="greet-neighbour"]').click()
    assert '幾好呀' in page.locator('.street-line').inner_text()
    page.wait_for_timeout(1200)
    after=page.evaluate('residentPoints()')
    assert set(after)=={'yan','kit','mei','wing','ching','wai'}
    assert before['yan']==after['yan']
    assert sum(before[k]!=v for k,v in after.items())>=4
    page.screenshot(path=str(out/'greet.jpg'))
    page.locator('#street-close').click()
    page.wait_for_function('p=>Math.hypot(residentPoints().yan[0]-p[0],residentPoints().yan[2]-p[2])>.3',arg=after['yan'],timeout=20000)
    stores=page.evaluate('shopReview()')
    assert len(stores)==7 and all(s['present'] and s['depth']<-1 and s['gestures'] for s in stores),stores
    assert 'marketBack' not in {s['id'] for s in stores}
    faces=page.evaluate('castFaces()')
    assert len(faces)==29 and all(faces.values()) and len(set(faces.values()))==len(faces),faces
    start_at(6.83,-6.94,-pi/2)
    ambient=page.locator('.street-overheard')
    ambient.filter(has_text='祥伯：菠蘿包').wait_for(timeout=30000)
    page.screenshot(path=str(out/'bakery-question.jpg'))
    ambient.filter(has_text='荣叔：冇菠蘿').wait_for(timeout=12000)
    page.screenshot(path=str(out/'bakery-reply.jpg'))
    page.locator('#street-interact').filter(has_text='荣叔').click()
    page.locator('[data-street-action="ask-shop"]').click()
    assert '冇菠蘿' in page.locator('.street-line').inner_text()
    assert ambient.is_hidden()
    page.locator('#street-close').click()
    # Start at the chess table before the invitation, then use the same directions
    # and guided walk available to the player to actually find its recipient.
    start_at(14.14,-12.88,pi/2,world_fields={'recordOutcome':'contact','trackedQuest':'record'})
    page.locator('#street-interact').filter(has_text='林伯').click(timeout=30000)
    page.locator('[data-street-action="record-after"]').click()
    assert '南洋' in page.locator('.street-line').inner_text()
    page.locator('#street-close').click()
    assert '南洋' in page.locator('#street-goal').inner_text()
    page.locator('#street-follow').click()
    page.locator('#street-interact').filter(has_text='祥伯').click(timeout=30000)
    page.locator('[data-street-action="record-accept"]').click()
    assert '帶埋屋企隻碟' in page.locator('.street-line').inner_text()
    page.locator('#street-close').click()
    assert '榕树' in page.locator('#street-goal').inner_text()
    start_at(-19.06,-7.46,-pi/2,['reunion-invite'])
    page.wait_for_function("typeof window.residentPoints === 'function'")
    page.locator('#street-follow:visible').wait_for()
    assert page.locator('#street-interact').is_hidden()
    page.screenshot(path=str(out/'former-grocer.jpg'))
    # Walk through the space the grocer's counter used to occupy.
    page.keyboard.down('w')
    try:
        page.wait_for_function("JSON.parse(localStorage.getItem('mgoi-neighborhood-v1')).streetView.x < -21.1")
    finally:
        page.keyboard.up('w')
    assert page.locator('#street-interact').is_hidden()
    start_at(-12.32,15.80,-pi/2)
    page.locator('#street-interact').filter(has_text='芳嫂').click(timeout=30000)
    assert '芳嫂' in page.locator('.street-speaker').inner_text()
    page.screenshot(path=str(out/'fruit-customer.jpg'))
    page.locator('#street-close').click()
    start_at(-12.32,14.80,-pi/2)
    page.locator('#street-interact').filter(has_text='萍姨').click(timeout=30000)
    assert page.locator('[data-street-action="ask-shop"]').is_visible()
    page.locator('#street-close').click()
    start_at(9,2,0)
    page.locator('#street-follow:visible').wait_for(timeout=30000)
    def saved_view():
        return page.evaluate("JSON.parse(localStorage.getItem('mgoi-neighborhood-v1')).streetView")
    for fallback in [False, True]:
        before=saved_view()
        if fallback: page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',bubbles:true}))")
        else: page.keyboard.down('d')
        page.wait_for_timeout(850)
        if fallback: page.evaluate("window.dispatchEvent(new KeyboardEvent('keyup',{key:'d',bubbles:true}))")
        else: page.keyboard.up('d')
        after=saved_view()
        assert after['x']>before['x']+.15 and abs(after['z']-before['z'])<.02,(before,after)
    assert not errors,errors
    print('PASS: interrupt and resume, distinct street faces, seven shop counters, removed grocery, guided invitation at east bakery and D strafe')
    browser.close()
