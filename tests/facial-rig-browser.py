"""Check actual glTF influences while normal audio, seek, pause and actor switch run."""
import os
from playwright.sync_api import sync_playwright
url=os.environ.get('FACE_URL','http://127.0.0.1:4256')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',args=['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':900,'height':680})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def observe(route):
        source=route.fetch().text().replace(' return (level=0,shape)=>{',''' window.faceAudit??=[];
 window.faceAudit.push(bindings);
 return (level=0,shape)=>{''')
        route.fulfill(body=source,content_type='text/javascript')
    page.route('**/dining-room.js',observe)
    def observe_render(route):
        source=route.fetch().text().replace('renderer.render(scene,camera);','''renderer.render(scene,camera);
        if (!audio.paused && window.faceAudit?.length) {
          const b=window.faceAudit.at(-1)[0]; (window.shownJaw??=[]).push(b.weights[b.keys.jawOpen]);
        }''')
        route.fulfill(body=source,content_type='text/javascript')
    page.route('**/face-review.js',observe_render)
    page.goto(url+'/face-review.html#aming')
    page.wait_for_function("!document.querySelector('#play').disabled")
    page.evaluate("""()=>{window.weights=(index=faceAudit.length-1)=>{
      const b=faceAudit[index][0];
      return Object.fromEntries(Object.entries(b.keys).filter(([k])=>!['workLeft','workRight','lookDown'].includes(k)).map(([k,i])=>[k,b.weights[i]]));
    }}""")
    for pose,key in [('双唇闭合','mouthPress'),('张口','jawOpen'),('圆唇','mouthPucker'),('展唇','mouthStretch'),('唇齿音','lowerLipTuck'),('抬舌','tongueUp')]:
        page.get_by_role('button',name=pose,exact=True).click()
        assert page.evaluate('key=>weights()[key]',key)>.7,pose
    page.get_by_text('播放对白',exact=True).click()
    page.wait_for_function("weights().jawOpen>.40")
    page.wait_for_function("new Set(window.shownJaw).size >= 4")
    page.evaluate("document.querySelector('audio').pause()")
    page.wait_for_function('Object.values(weights()).every(v=>v===0)')
    page.evaluate("async()=>{const a=document.querySelector('audio');a.playbackRate=.72;a.currentTime=.45;await a.play()}")
    page.wait_for_function("weights().jawOpen>.2")
    page.locator('#actor').select_option('fang')
    page.wait_for_function("!document.querySelector('#play').disabled && faceAudit.length===2")
    assert page.evaluate('Object.values(weights(0)).every(v=>v===0)')
    page.get_by_text('播放对白',exact=True).click()
    page.wait_for_function("weights().jawOpen>.2")
    page.wait_for_function("document.querySelector('audio').ended && Object.values(weights()).every(v=>v===0)",timeout=15000)
    page.goto(url+'/story-preview.html?story=table')
    page.locator('#choices button').first.wait_for(timeout=90000)
    page.get_by_text('听这句',exact=True).click()
    page.wait_for_function('faceAudit.some(group=>group.some(b=>b.weights[b.keys.jawOpen]>.15))')
    assert not errors,errors
    print('PASS six distinct poses, real speech, pause, slow seek, speaker switch, ending closure and story dialogue')
    browser.close()
