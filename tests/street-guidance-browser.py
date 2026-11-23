"""Visit the real street, press the guide button and measure visible bodies every frame."""
import os
from playwright.sync_api import sync_playwright

url = os.environ.get('STREET_URL', 'http://127.0.0.1:4290')
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True, args=['--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 960, 'height': 620})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def observe(route):
        source = route.fetch().text().replace(' function frame(now){', '''
 window.guidanceReview={frames:0,metres:0,closest:{},people:0};
 function frame(now){''').replace('  const snippet=scene.overheard();', '''
  if(window.guidanceReview.observe){
   const log=window.guidanceReview;
   log.frames++;log.guiding=!!guide;log.mode=travel.snapshot().mode;
   if(log.player)log.metres+=distance(log.player,current);
   log.player={x:current.x,z:current.z};log.people=0;
   for(const [id,{model}] of scene.actors){
    if(!model.visible)continue;
    log.people++;
    log.closest[id]=Math.min(log.closest[id]??Infinity,distance(current,model.position));
   }
  }
  const snippet=scene.overheard();''')
        route.fulfill(body=source, content_type='text/javascript')

    page.route('**/street-game.js', observe)

    def trip(start, flags, items, destination, fresh=False):
        page.goto(url+'/?street=3d')
        if fresh:
            page.locator('.vinyl-new').click()
            page.locator('[data-learning-mode="experienced"]').click()
            page.locator('[data-street-action="go-out"]').click(timeout=90000)
            page.locator('[data-street-action="coat-start"]').click()
            page.locator('#street-follow').filter(has_text='自己走').click()
        else:
            page.evaluate('''async({start,flags,items})=>{
              const {freshWorld,saveWorld}=await import('./neighborhood-state.js');
              const w=freshWorld();w.location='street';
              w.streetView={x:start[0],z:start[1],heading:0,pitch:0};
              w.flags.push(...flags);w.items.push(...items);saveWorld(localStorage,w);
              localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'experienced',showMeaning:true}));
            }''', {'start': start, 'flags': flags, 'items': items})
            page.reload()
            page.locator('.vinyl-continue').click()
        button = page.locator('#street-follow').filter(has_text='带我去任务地点')
        button.wait_for(timeout=90000)
        page.evaluate('window.guidanceReview.observe=true')
        button.click()
        page.wait_for_function("guidanceReview.mode==='arrived'&&!guidanceReview.guiding", timeout=180000)
        interact = page.locator('#street-interact')
        assert destination in interact.inner_text(), (destination, interact.inner_text())
        log = page.evaluate('guidanceReview')
        assert log['frames'] > 10 and log['people'] >= 29
        assert min(log['closest'].values()) >= .829, log
        print(destination, 'frames', log['frames'], 'metres', round(log['metres'],1),
              'minimum', min(log['closest'].items(), key=lambda item:item[1]), flush=True)
        interact.click()
        page.locator('.street-dialogue:visible').wait_for()
        return log

    trip(None, [], [], '芳姐', fresh=True)
    # Start behind Yan's normal walking route and catch up on the way home.
    home=trip([11.49,1.85], [], [], '阿晴')
    assert home['closest']['yan'] < 1.8,home
    # Approach Chow from across the street, past the customers and the restaurant entrance.
    trip([11.58,3.15], ['coat-start','shop-check','coat-inspected','coat-detail','coat-route-recover','guest-found'],
         ['wrongCoat'], '周叔')
    assert not errors, errors
    browser.close()
