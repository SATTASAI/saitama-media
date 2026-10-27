// Exact public allowlist shared by Node and Cloudflare; private server files never enter it.
export const PUBLIC_ASSETS = {
  '/':['index.html','text/html; charset=utf-8'],
  '/index.html':['index.html','text/html; charset=utf-8'],
  '/app.js':['app.js','text/javascript; charset=utf-8'],
  '/style.css':['style.css','text/css; charset=utf-8'],
  ...Object.fromEntries(['noto-sans-thai-thai','noto-sans-thai-latin','lora-latin-600'].map(name=>['/fonts/'+name+'.woff2',['fonts/'+name+'.woff2','font/woff2']])),
  ...Object.fromEntries(['cover-animals','cover-math','cover-vowels'].map(name=>['/assets/'+name+'.webp',['assets/'+name+'.webp','image/webp']])),
  '/assets/brand-mark.png':['assets/brand-mark.png','image/png'],
  ...Object.fromEntries(['squares-four','file-text','pencil-simple','play-circle','gear','upload-simple','magnifying-glass','sliders-horizontal','plus','x','caret-left','caret-right','caret-down','sun','moon','check-circle','arrow-square-out','arrows-clockwise','cloud-check','dots-three','list','book-open-text'].map(name=>['/icons/'+name+'.svg',['icons/'+name+'.svg','image/svg+xml']])),
};
