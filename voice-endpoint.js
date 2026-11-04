// Public backend origin is injected by the Pages build. Local tests stay same-origin.
export function voiceUrl(path){
 const base=document.documentElement.dataset.voiceApi||'';
 return base?new URL(path,base).href:path;
}
