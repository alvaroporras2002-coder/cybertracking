/** Decorative effects only. No application state or tracking. */
export function initMotion({enabled=true}={}) {
  const canvas=document.getElementById('particles');
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let desired=Boolean(enabled),frame=0,points=[],width=0,height=0,last=0;
  const ctx=canvas?.getContext('2d');
  function permitted(){return desired&&!media.matches&&!document.hidden;}
  function resize(){
    if(!canvas||!ctx)return;
    width=window.innerWidth;height=window.innerHeight;
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const count=width<740?10:24;
    points=Array.from({length:count},()=>({x:Math.random()*width,y:Math.random()*height,r:Math.random()*.9+.45,vx:(Math.random()-.5)*.035,vy:-(Math.random()*.025+.01),a:Math.random()*.3+.12}));
  }
  function draw(time){
    if(!permitted()||!ctx)return;
    const dt=Math.min(time-last||16,40);last=time;
    ctx.clearRect(0,0,width,height);
    const light=document.documentElement.dataset.theme==='light';
    for(const p of points){
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.y<0)p.y=height;if(p.x<0)p.x=width;if(p.x>width)p.x=0;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=light?`rgba(18,110,91,${p.a*.65})`:`rgba(138,217,195,${p.a})`;ctx.fill();
    }
    frame=requestAnimationFrame(draw);
  }
  function sync(){
    cancelAnimationFrame(frame);frame=0;
    const active=desired&&!media.matches;
    document.documentElement.dataset.motion=active?'on':'off';
    if(canvas)canvas.hidden=!active;
    if(permitted()&&ctx){last=0;frame=requestAnimationFrame(draw);}
    else ctx?.clearRect(0,0,width,height);
  }
  const onVisibility=()=>sync();
  const onResize=()=>{resize();sync();};
  resize();sync();
  window.addEventListener('resize',onResize,{passive:true});
  document.addEventListener('visibilitychange',onVisibility);
  media.addEventListener('change',sync);
  return {update(value){desired=Boolean(value);sync();},destroy(){cancelAnimationFrame(frame);window.removeEventListener('resize',onResize);document.removeEventListener('visibilitychange',onVisibility);media.removeEventListener('change',sync);ctx?.clearRect(0,0,width,height);}};
}
