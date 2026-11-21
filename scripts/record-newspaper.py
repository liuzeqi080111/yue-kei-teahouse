"""Record the game's newspaper action with its actual dialogue cues."""
from pathlib import Path
import subprocess
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = root / "output/repairs/regular"
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge", headless=True, args=["--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width":960,"height":720})
    markup = """<style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>
    <script type="importmap">{"imports":{"three":"./assets/street/three/build/three.module.min.js","three/addons/":"./assets/street/three/examples/jsm/"}}</script>
    <script type="module">
    import {createStoryScene} from './story-scene.js';
    import {NPC_SPEECH_CUES} from './npc-voice-manifest.js';
    window.take=await createStoryScene(document.querySelector('canvas'),'table');
    take.set('seat',{});window.start=performance.now();
    window.drawFrame=i=>{
      const [times,shapes]=NPC_SPEECH_CUES['story-table-seat.wav'];
      const time=i/24;let index=0;
      while(index+1<times.length&&times[index+1]<=time*100)index++;
      take.speech('regular',index<shapes.length?.75:0,shapes[index]||'X');
      take.tick(start+time*1000);take.render();
    };
    </script>"""
    page.route("**/review-stage.html",lambda route:route.fulfill(content_type="text/html",body=markup))
    page.goto("http://127.0.0.1:4236/review-stage.html")
    page.wait_for_function("typeof window.drawFrame === 'function'",timeout=90000)
    for frame in range(97):
        page.evaluate("drawFrame",frame)
        page.screenshot(path=str(out/f"{frame:04d}.jpg"),type="jpeg",quality=90)
    browser.close()
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-y","-loglevel","error","-framerate","24","-i",str(out/"%04d.jpg"),"-i",str(root/"assets/story-table-seat.wav"),"-c:v","libx264","-pix_fmt","yuv420p","-af","apad","-t","4","-movflags","+faststart",str(root/"assets/rehearsal-regular.mp4")],check=True)

