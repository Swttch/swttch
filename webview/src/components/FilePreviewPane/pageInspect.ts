/** The message the frame sends when the reader picks an element, in element-selection mode. */
export const PAGE_ELEMENT_MESSAGE = 'ccg-page-element';
/** The message the pane sends the frame to turn element selection on or off. */
export const PAGE_SELECT_MESSAGE = 'ccg-page-select';
/** The message the pane sends the frame to ask for a picture of what it shows. */
export const PAGE_SNAPSHOT_MESSAGE = 'ccg-page-snapshot';
/** The frame's answer to a snapshot request. */
export const PAGE_SNAPSHOT_REPLY = 'ccg-page-snapshot-reply';

/**
 * What Claude Desktop sends Claude about a picked element (its `captureElementContext`, read from the app):
 * the tag, id and classes, a short list of attributes, the computed styles of a fixed list of properties,
 * the box, the first 200 characters of its text, up to four ancestors, where a link or click handler goes,
 * its markup (2000 characters), its siblings' markup with the element marked, and a picture of it.
 */
export interface PickedElement {
  selector: string;
  html: string;
  tag: string;
  name: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  computedStyles: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number };
  innerText?: string;
  parentPath?: string;
  action?: string;
  siblingHTML?: string;
  /** PNG, base64, without the `data:` prefix. */
  screenshot?: string;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** What the frame reported about the element picked, or undefined when the message is something else. */
export function elementFromMessage(data: unknown): PickedElement | undefined {
  const m = data as Record<string, unknown> | null;
  if (m?.type !== PAGE_ELEMENT_MESSAGE || typeof m.selector !== 'string' || typeof m.html !== 'string') return undefined;
  const box = (m.boundingBox ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  return {
    selector: m.selector,
    html: m.html,
    tag: text(m.tag) ?? 'div',
    name: text(m.name) ?? '',
    id: text(m.id) || undefined,
    classes: Array.isArray(m.classes) ? m.classes.filter((c): c is string => typeof c === 'string') : [],
    attributes: (m.attributes ?? {}) as Record<string, string>,
    computedStyles: (m.computedStyles ?? {}) as Record<string, string>,
    boundingBox: { x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height) },
    innerText: text(m.innerText) || undefined,
    parentPath: text(m.parentPath) || undefined,
    action: text(m.action) || undefined,
    siblingHTML: text(m.siblingHTML) || undefined,
    screenshot: text(m.screenshot) || undefined,
  };
}

/** The picture the frame answered a snapshot request with, as a data URL, or null when it could not take one. */
export function snapshotFromMessage(data: unknown): { id: string; png: string | null } | undefined {
  const m = data as { type?: unknown; id?: unknown; png?: unknown } | null;
  if (m?.type !== PAGE_SNAPSHOT_REPLY || typeof m.id !== 'string') return undefined;
  return { id: m.id, png: typeof m.png === 'string' ? m.png : null };
}

/**
 * Claude Desktop's "Select element". Desktop does it with Chromium's own DevTools: it attaches the debugger
 * to the browser view and turns on `Overlay.setInspectMode` (searchForNode), which draws the hover overlay
 * and its info card itself, in the colours used below, then reads the picked node over the same protocol.
 * There is no library behind it. A page in a frame cannot reach the DevTools protocol, so the same thing is
 * done from inside the page: the box-model overlay and the card are drawn by the frame's script, and the
 * element's context is read from the DOM. The guard only listens: nothing changes in the page until the pane
 * asks for the mode.
 */
const INSPECT = String.raw`<script>(function(){
var on=false,layers=null,card=null;
var STYLES=["display","position","flex-direction","justify-content","align-items","width","height","padding","margin","background-color","color","font-size","font-weight","border-radius","border-width","border-style","border-color"];
var ATTRS=["data-testid","data-test-id","aria-label","name","type","href","role","placeholder","title","alt","onclick","value","src"];
function selectorOf(e){
  var parts=[];
  while(e&&e.nodeType===1&&e!==document.documentElement){
    var s=e.tagName.toLowerCase();
    if(e.id){parts.unshift(s+'#'+e.id);break}
    var i=1,p=e;while((p=p.previousElementSibling))if(p.tagName===e.tagName)i++;
    parts.unshift(s+':nth-of-type('+i+')');e=e.parentElement;
  }
  return parts.join(' > ');
}
function px(v){return parseFloat(v)||0}
function roleOf(e){
  var r=e.getAttribute('role');if(r)return r;
  var t=e.tagName.toLowerCase();
  if(/^h[1-6]$/.test(t))return 'heading';
  if(t==='img')return 'image';
  if(t==='a'&&e.hasAttribute('href'))return 'link';
  return {button:'button',nav:'navigation',main:'main',header:'banner',footer:'contentinfo',ul:'list',ol:'list',li:'listitem',p:'paragraph',input:'textbox',textarea:'textbox',select:'combobox',table:'table',form:'form',section:'region',article:'article',aside:'complementary'}[t]||'generic';
}
function nameOf(e){
  var n=e.getAttribute('aria-label')||e.getAttribute('alt')||e.getAttribute('title')||(e.innerText||e.textContent||'');
  return String(n).trim().replace(/\s+/g,' ').slice(0,80);
}
function focusable(e){return e.matches('a[href],button,input,select,textarea,[tabindex]')}
function ensure(){
  if(layers)return;
  // Margin, border and padding are rings (a border of the box's own width), the content a filled box, so no part of the
  // page is covered by more than one colour and the element stays readable under the overlay.
  layers=['rgba(246,178,107,.66)','rgba(255,229,153,.66)','rgba(147,196,125,.55)','rgba(111,168,220,.66)'].map(function(c,i){
    var d=document.createElement('div');
    d.style.cssText='position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;display:none;border:0 solid '+c+';background:'+(i===3?c:'transparent');
    document.documentElement.appendChild(d);return d;
  });
  // The info card, drawn as Chromium's own inspect overlay draws it (measured on Claude Desktop's): a white card with a
  // blue tab and a notch pointing at the element, the tag and size, and the accessibility facts below.
  card=document.createElement('div');
  card.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;display:none;font:13px/18.6px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#323941;text-align:left';
  card.innerHTML='<div data-tab style="position:absolute;left:0;width:120px;height:8px;z-index:1;background:linear-gradient(#4993eb,#4286d6)"></div>'
   +'<svg data-notch width="13" height="7" viewBox="0 0 13 7" style="position:absolute;left:12px;z-index:2"><polygon points="0,7 6.5,0 13,7" fill="#fff"/></svg>'
   +'<div data-body style="position:absolute;left:0;background:#fff;border-radius:4px;padding:4px 9px 6px;box-shadow:0 2px 8px rgba(0,0,0,.28);white-space:nowrap"></div>';
  document.documentElement.appendChild(card);
}
function place(d,l,t,w,h,ring){d.style.display='block';d.style.left=l+'px';d.style.top=t+'px';d.style.width=Math.max(0,w)+'px';d.style.height=Math.max(0,h)+'px';if(ring)d.style.borderWidth=ring.map(function(v){return Math.max(0,v)+'px'}).join(' ')}
function esc(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function mark(e){
  ensure();
  if(!e||e===document.documentElement){layers.concat(card).forEach(function(d){d.style.display='none'});return}
  var r=e.getBoundingClientRect(),c=getComputedStyle(e);
  var sides=['Top','Right','Bottom','Left'];
  var m=sides.map(function(s){return px(c['margin'+s])});
  var b=sides.map(function(s){return px(c['border'+s+'Width'])});
  var p=sides.map(function(s){return px(c['padding'+s])});
  place(layers[0],r.left-m[3],r.top-m[0],r.width+m[1]+m[3],r.height+m[0]+m[2],m);
  place(layers[1],r.left,r.top,r.width,r.height,b);
  place(layers[2],r.left+b[3],r.top+b[0],r.width-b[1]-b[3],r.height-b[0]-b[2],p);
  place(layers[3],r.left+b[3]+p[3],r.top+b[0]+p[0],r.width-b[1]-b[3]-p[1]-p[3],r.height-b[0]-b[2]-p[0]-p[2]);
  var tag=e.tagName.toLowerCase(),cls=(e.getAttribute('class')||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(function(x){return '.'+x}).join('');
  var NS=' ',size=function(v){return String(Math.round(v*100)/100)};
  var ok='<svg width="16" height="16" viewBox="0 0 16 16" style="vertical-align:-3px;margin-left:1px"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#9e9e9e" stroke-width="1.4"/><path d="M4.2 4.2 11.8 11.8" stroke="#9e9e9e" stroke-width="1.4"/></svg>';
  var yes='<svg width="16" height="16" viewBox="0 0 16 16" style="vertical-align:-3px;margin-left:1px"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="#2e7d32" stroke-width="1.5"/></svg>';
  var row=function(k,v,g){return '<div style="display:flex;justify-content:space-between;line-height:19.6px;gap:'+(g||10)+'px"><span style="color:#666">'+k+'</span><span>'+v+'</span></div>'};
  var body=card.querySelector('[data-body]');
  body.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px"><span><b style="color:#881280">'+tag+'</b><span style="color:#1a1aa6">'+(e.id?'#'+esc(e.id):'')+esc(cls)+'</span></span><span>'+size(r.width)+NS+'×'+NS+size(r.height)+'</span></div>'
   +'<div style="display:flex;align-items:center;gap:8px;margin:14px 0 6px;color:#333;font-size:10px;line-height:12px;letter-spacing:.035em;font-weight:600"><span>ACCESSIBILITY</span><i style="flex:1;height:1px;background:#ddd"></i></div>'
   +row('Name',esc(nameOf(e).slice(0,40)))+row('Role',roleOf(e))+row('Keyboard-focusable',focusable(e)?yes:ok,2);
  card.style.display='block';
  var ch=body.offsetHeight+8,cw=body.offsetWidth;
  var mb=m[2],mt=m[0];
  var belowTop=Math.round(r.bottom+mb)+1,aboveTop=Math.round(r.top-mt)-1-ch;
  var below=belowTop+ch<=innerHeight||aboveTop<4;
  var tab=card.querySelector('[data-tab]'),notch=card.querySelector('[data-notch]');
  card.style.width=cw+'px';card.style.height=ch+'px';
  if(below){
    tab.style.top='0';tab.style.borderRadius='7px 7px 0 0';body.style.top='8px';
    notch.style.top='1px';notch.style.transform='none';
    card.style.top=belowTop+'px';
  }else{
    tab.style.top=(ch-8)+'px';tab.style.borderRadius='0 0 7px 7px';body.style.top='0';
    notch.style.top=(ch-8)+'px';notch.style.transform='scaleY(-1)';
    card.style.top=aboveTop+'px';
  }
  card.style.left=Math.round(Math.max(4,Math.min(r.left,innerWidth-cw-4)))+'px';
}
function snap(rect,done){
  var finished=false;function end(v){if(!finished){finished=true;done(v)}}
  setTimeout(function(){end(null)},2500);
  try{
    var w=innerWidth,h=innerHeight;
    var clone=document.documentElement.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('script'),function(s){s.remove()});
    var xml=new XMLSerializer().serializeToString(clone);
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><foreignObject x="'+(-scrollX)+'" y="'+(-scrollY)+'" width="'+document.documentElement.scrollWidth+'" height="'+document.documentElement.scrollHeight+'">'+xml+'</foreignObject></svg>';
    var img=new Image();
    img.onload=function(){
      try{
        var pad=8,x=0,y=0,cw=w,ch=h;
        if(rect){x=Math.max(0,Math.floor(rect.left-pad));y=Math.max(0,Math.floor(rect.top-pad));cw=Math.min(w-x,Math.ceil(rect.width+pad*2));ch=Math.min(h-y,Math.ceil(rect.height+pad*2))}
        if(cw<=0||ch<=0)return end(null);
        var k=Math.min(1,1200/Math.max(cw,ch));
        var cv=document.createElement('canvas');cv.width=Math.round(cw*k);cv.height=Math.round(ch*k);
        var cx=cv.getContext('2d');
        // A page paints its canvas with the colour of its root or body, which the picture of its markup does not carry along.
        var bg=getComputedStyle(document.documentElement).backgroundColor;
        if(!bg||/rgba\(.*,\s*0\)$/.test(bg)||bg==='transparent')bg=getComputedStyle(document.body).backgroundColor;
        if(!bg||/rgba\(.*,\s*0\)$/.test(bg)||bg==='transparent')bg='#ffffff';
        cx.fillStyle=bg;cx.fillRect(0,0,cv.width,cv.height);
        cx.drawImage(img,x,y,cw,ch,0,0,cv.width,cv.height);
        end(cv.toDataURL('image/png'));
      }catch(x){end(null)}
    };
    img.onerror=function(){end(null)};
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }catch(x){end(null)}
}
function context(el){
  var attrs={};ATTRS.forEach(function(a){var v=el.getAttribute(a);if(v)attrs[a]=v});
  var cs=getComputedStyle(el),styles={};STYLES.forEach(function(k){styles[k]=cs.getPropertyValue(k)});
  var r=el.getBoundingClientRect();
  var path=[],a=el.parentElement;
  for(var i=0;i<4&&a&&a!==document.body;i++){var s=a.tagName.toLowerCase();if(a.id)s+='#'+a.id;else if(a.getAttribute('class'))s+='.'+a.getAttribute('class').split(' ')[0];path.unshift(s);a=a.parentElement}
  var sib=null;
  if(el.parentElement){
    sib=Array.prototype.map.call(el.parentElement.children,function(c){
      if(c===el)return '\x3c!-- SELECTED --\x3e'+c.outerHTML;
      var cl=c.getAttribute('class')||'';
      return '<'+c.tagName.toLowerCase()+(c.id?' id="'+c.id+'"':'')+(cl?' class="'+cl.split(' ').slice(0,3).join(' ')+'"':'')+' />';
    }).join('\n');
    if(sib.length>2000)sib=sib.slice(0,2000)+'...';
  }
  var outer=el.outerHTML;if(outer.length>2000)outer=outer.slice(0,2000)+'...';
  return {selector:selectorOf(el),html:outer,tag:el.tagName.toLowerCase(),name:nameOf(el),id:el.id||'',classes:(el.getAttribute('class')||'').split(/\s+/).filter(Boolean),attributes:attrs,computedStyles:styles,boundingBox:{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height},innerText:String(el.innerText||'').slice(0,200),parentPath:path.join(' > '),action:el.getAttribute('href')?'navigates to: '+el.getAttribute('href'):(el.getAttribute('onclick')?'onclick: '+el.getAttribute('onclick').slice(0,100):''),siblingHTML:sib||''};
}
addEventListener('message',function(m){
  var d=m.data;if(!d)return;
  if(d.type==='${PAGE_SELECT_MESSAGE}'){
    on=!!d.on;if(!on)mark(null);
  }else if(d.type==='${PAGE_SNAPSHOT_MESSAGE}'){
    var hidden=layers?layers.concat(card):[];hidden.forEach(function(x){x.style.display='none'});
    snap(null,function(png){try{parent.postMessage({type:'${PAGE_SNAPSHOT_REPLY}',id:String(d.id),png:png},'*')}catch(x){}});
  }
});
document.addEventListener('mousemove',function(e){if(on)mark(e.target)},true);
document.addEventListener('click',function(e){
  if(!on)return;
  e.preventDefault();e.stopPropagation();
  var el=e.target,ctx=context(el),rect=el.getBoundingClientRect();
  mark(null);
  snap(rect,function(png){
    if(png)ctx.screenshot=png.replace(/^data:image\/png;base64,/,'');
    ctx.type='${PAGE_ELEMENT_MESSAGE}';
    try{parent.postMessage(ctx,'*')}catch(x){}
  });
},true);
})()</script>`;

export function withInspector(html: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + INSPECT + html.slice(head.index + head[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + INSPECT + html.slice(root.index + root[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype[0].length) + INSPECT + html.slice(doctype[0].length);
  return INSPECT + html;
}
