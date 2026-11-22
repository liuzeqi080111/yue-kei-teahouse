"""Render actual street occupants at deterministic times and viewpoints."""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = root / "output/strict-review"
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        channel="msedge", headless=True, args=["--enable-unsafe-swiftshader"]
    )
    page = browser.new_page(viewport={"width":1100, "height":800})
    page.on("pageerror", lambda error: print(error))
    def observe_fixtures(route):
        source = route.fetch().text().replace(
            " return (point,engaged,now)=>{",
            " window.auditJobs=jobs;return (point,engaged,now)=>{",
        )
        route.fulfill(body=source,content_type="text/javascript")
    page.route("**/street-fixtures.js",observe_fixtures)
    markup = """<style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style>
    <canvas></canvas><script type="importmap">{"imports":{"three":"./assets/street/three/build/three.module.min.js","three/addons/":"./assets/street/three/examples/jsm/"}}</script>
    <script type="module">
    import * as T from 'three';
    import {loadStreet} from './street-render.js';
    import {createStreetNav,SHOPS,marketRoomBlocks,shopBlocks} from './street-space.js';
    window.street=await loadStreet(document.querySelector('canvas'));
    const shops=Object.values(SHOPS);
    window.walkNav=createStreetNav(street.layout,p=>marketRoomBlocks(p)||shops.some(s=>shopBlocks(s,p)));
    window.auditTime=0;
    window.drawAudit=({id,time,side=0,near=false})=>{
      const model=street.actors.get(id).model;
      const point={x:model.position.x,z:model.position.z};
      for(let t=auditTime;t<=time;t+=16)street.animateWork(point,id==='aqing'?id:null,t);
      auditTime=time;
      const angle=model.rotation.y+side,distance=near?.9:2.3;
      const x=model.position.x+Math.sin(angle)*distance;
      const z=model.position.z+Math.cos(angle)*distance;
      street.render({x,y:near?1.12:1.55,z,heading:Math.atan2(model.position.x-x,z-model.position.z),pitch:near?-.07:-.11});
      window.auditPick=(px,py)=>{
        const camera=new T.PerspectiveCamera(59,1100/800,.055,200);
        camera.position.set(x,near?1.12:1.55,z);camera.rotation.set(near?-.07:-.11,-Math.atan2(model.position.x-x,z-model.position.z),0,'YXZ');camera.updateMatrixWorld(true);
        const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(px/550-1,1-py/400),camera);
        const hit=ray.intersectObject(model)[0];if(!hit)return null;
        const attrs=hit.object.geometry.attributes;
        return {name:hit.object.name,face:hit.faceIndex,vertices:[hit.face.a,hit.face.b,hit.face.c].map(i=>({index:i,pos:[attrs.position.getX(i),attrs.position.getY(i),attrs.position.getZ(i)],color:[attrs.color.getX(i),attrs.color.getY(i),attrs.color.getZ(i)]}))};
      };
    };
    </script>"""
    page.route("**/audit.html",lambda route:route.fulfill(content_type="text/html",body=markup))
    page.goto(os.environ.get('STREET_URL','http://127.0.0.1:4290')+'/audit.html')
    page.wait_for_function("typeof window.drawAudit === 'function'",timeout=90000)
    for index,name in enumerate(("aqing","aming","fang","regular")):
        for side in (-.5,0,.5):
            page.evaluate("drawAudit",{"id":name,"time":12000+index*1000,"side":side,"near":True})
            page.screenshot(path=str(out / f"{name}-{side}.jpg"),type="jpeg",quality=92)
            if name=='aming' and side==0:
                (out/'ming-pixels.json').write_text(json.dumps(page.evaluate('()=>[[590,165],[660,245],[400,580],[620,605]].map(p=>auditPick(...p))'),indent=2))
    data = page.evaluate("""()=>auditJobs.filter(j=>['aqing','aming','fang'].includes(j.id)).map(j=>({
      id:j.id,props:[j.left.position.toArray(),j.right.position.toArray()],
      bones:Object.fromEntries(Object.entries(j.bones).filter(([n])=>/Hand/.test(n)).map(([n,b])=>[n,b.getWorldPosition(b.position.clone()).toArray()]))
    }))""")
    (out/"hands.json").write_text(json.dumps(data,indent=2),encoding="utf-8")
    locomotion=page.evaluate("""()=>{
      const ids=['yan','kit','mei','wing','ching','wai'];
      const bodyMeshes=Object.fromEntries(ids.map(id=>{
        let mesh;street.actors.get(id).model.traverse(m=>{if(m.morphTargetDictionary?.stride!==undefined)mesh=m;});
        if(!mesh)throw Error(id+' has no walking mesh');
        return [id,mesh];
      }));
      const metrics=Object.fromEntries(ids.map(id=>[id,{distance:0,maxTurnRate:0,maxSpeed:0,streets:[],steps:0}]));
      const streetName=({x,z})=>{
        if(Math.abs(x)<6){
          if(z<-13)return '北街';
          if(z>13)return '南街';
          if(Math.abs(z)<1.6)return '中巷';
        }
        if(Math.abs(z)>2&&Math.abs(z)<12)return x>0?'东街':'西街';
      };
      // Six simulated minutes cover a full circuit even on the longest walk.
      for(let frame=1;frame<=7200;frame++){
        const previous=Object.fromEntries(ids.map(id=>{const a=street.actors.get(id).model;return [id,{x:a.position.x,z:a.position.z,yaw:a.rotation.y}]}));
        street.animateWork({x:13,z:6},null,15000+frame*50);
        for(const id of ids){
          const model=street.actors.get(id).model,p=previous[id],m=metrics[id];
          if(!walkNav.walkable(model.position.x,model.position.z))throw Error(id+' left the walkable street');
          const area=streetName(model.position);
          if(area&&area!==m.streets.at(-1))m.streets.push(area);
          const dx=model.position.x-p.x,dz=model.position.z-p.z,d=Math.hypot(dx,dz);
          const turn=Math.atan2(Math.sin(model.rotation.y-p.yaw),Math.cos(model.rotation.y-p.yaw));
          m.distance+=d;m.maxSpeed=Math.max(m.maxSpeed,d/.05);m.maxTurnRate=Math.max(m.maxTurnRate,Math.abs(turn)/.05);
          if(d>.0001){
            m.steps++;
            const error=Math.atan2(Math.sin(Math.atan2(dx,dz)-model.rotation.y),Math.cos(Math.atan2(dx,dz)-model.rotation.y));
            if(Math.abs(error)>.03)throw Error(id+' slid sideways while turning');
            const mesh=bodyMeshes[id],facing=mesh.getWorldDirection(mesh.position.clone());
            if((dx*facing.x+dz*facing.z)/d<.999)throw Error(id+' visible body faces away from travel');
          }
        }
      }
      const paused=street.actors.get('kit').model.position.clone();
      for(let frame=1;frame<=60;frame++)street.animateWork({x:13,z:6},'kit',375000+frame*50);
      if(paused.distanceTo(street.actors.get('kit').model.position)>1e-6)throw Error('Neighbour moved during dialogue');
      return metrics;
    }""")
    for name,metrics in locomotion.items():
        assert metrics['distance']>195,(name,metrics)
        assert len(set(metrics['streets']))>=4,(name,metrics)
        assert metrics['maxTurnRate']<=1.901,(name,metrics)
        assert metrics['maxSpeed']<=.781,(name,metrics)
    (out/'locomotion.json').write_text(json.dumps(locomotion,indent=2))
    print('PASS six-minute multi-street walk/turn/stop sweep and dialogue pause')
    for x,z,engaged in [(-5.75,-1.12,None),(3.6,1.17,None),(.8,.42,'wai')]:
        page.reload()
        page.wait_for_function("typeof window.drawAudit === 'function'",timeout=90000)
        result=page.evaluate("""({x,z,engaged})=>{
          const tracked=['yan','kit','mei','wing','ching','wai'].map(id=>{
            const p=street.actors.get(id).model.position;
            return {id,p,last:p.clone(),distance:0,idle:0,maxIdle:0};
          });
          for(let tick=0;tick<=12000;tick++){
            street.animateWork({x,z},engaged,tick*50);
            for(const w of tracked){
              const d=Math.hypot(w.p.x-w.last.x,w.p.z-w.last.z);
              w.distance+=d;w.idle=d>.001?0:w.idle+.05;
              w.maxIdle=Math.max(w.maxIdle,w.idle);w.last.copy(w.p);
            }
          }
          return tracked.map(({id,distance,maxIdle})=>({id,distance,maxIdle}));
        }""",{'x':x,'z':z,'engaged':engaged})
        for walker in result:
            if walker['id']==engaged:
                assert walker['distance']==0,walker
            else:
                assert walker['maxIdle']<15 and walker['distance']>320,(x,z,walker)
    print('PASS ten minutes at each blocked crossing and during a sustained conversation')
    browser.close()
