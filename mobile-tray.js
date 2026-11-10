// Shared HUD keeps the microphone in the same place on desktop and mobile.
export function createMobileTray({onLayout}) {
 const media=matchMedia('(max-width:650px), (max-width:950px) and (max-height:520px) and (orientation:landscape)');
 function viewport(){
  const vv=window.visualViewport,typing=document.activeElement?.matches('textarea,input:not([type=checkbox])');
  const inset=typing&&vv&&Math.abs(vv.scale-1)<.025?Math.max(0,innerHeight-vv.height-vv.offsetTop):0;
  document.body.style.setProperty('--mobile-bottom-inset',Math.round(inset)+'px');
  document.body.dataset.mobileKeyboard=String(Boolean(media.matches&&typing&&(inset>80||(vv?.height||innerHeight)<420)));
 }
 media.addEventListener('change',()=>{viewport();onLayout?.();});
 window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
 document.addEventListener('focusin',viewport);document.addEventListener('focusout',()=>requestAnimationFrame(viewport));
 return {sync:viewport,get mobile(){return media.matches;}};
}
export function compactMobileActions(){}
