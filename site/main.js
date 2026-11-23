'use strict';

const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Header shadow after scrolling. */
const head=document.querySelector('[data-head]');
if(head){
  const onScroll=()=>{head.dataset.scrolled=window.scrollY>8?'true':'false';};
  onScroll();
  window.addEventListener('scroll',onScroll,{passive:true});
}

/* Reveal blocks once they enter the viewport. */
if(!reduceMotion&&'IntersectionObserver' in window){
  const items=document.querySelectorAll('.reveal');
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  },{rootMargin:'0px 0px -8% 0px',threshold:.08});
  items.forEach(item=>observer.observe(item));
}else{
  document.querySelectorAll('.reveal').forEach(item=>item.classList.add('is-visible'));
}

/* Copy SHA-256 with a short, visible confirmation. */
for(const button of document.querySelectorAll('.copy[data-copy]')){
  button.addEventListener('click',async()=>{
    const value=button.dataset.copy;
    if(!value)return;
    try{
      await navigator.clipboard.writeText(value);
    }catch{
      const field=document.createElement('textarea');
      field.value=value;
      field.setAttribute('readonly','');
      field.style.position='fixed';
      field.style.opacity='0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    const original=button.textContent;
    button.textContent='已复制';
    button.dataset.done='true';
    window.setTimeout(()=>{button.textContent=original;delete button.dataset.done;},1600);
  });
}

/* Keep the current year honest without a build step. */
const year=document.querySelector('[data-year]');
if(year)year.textContent=String(new Date().getFullYear());
