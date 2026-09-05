'use client';
import {useRef} from 'react';
import type {CanvasElement} from './document-model.ts';
export function MediaView({item,playing=false}:{item:CanvasElement;playing?:boolean}){
 const ref=useRef<HTMLMediaElement|null>(null),m=item.media;if(!m)return null;
 const props={src:m.src,controls:true,autoPlay:playing&&m.autoplay,loop:m.loop,muted:m.muted,preload:'metadata' as const,'aria-label':item.content?.alt??item.name,onLoadedMetadata:()=>{if(ref.current)ref.current.currentTime=m.start;},onTimeUpdate:()=>{const media=ref.current;if(media&&m.end&&media.currentTime>=m.end){if(m.loop){media.currentTime=m.start;void media.play().catch(()=>{});}else media.pause();}},onPointerDown:(e:React.PointerEvent)=>e.stopPropagation(),style:{width:'100%',height:'100%'}};
 return item.type==='audio'?<audio ref={ref as React.RefObject<HTMLAudioElement>} {...props}/>:<video ref={ref as React.RefObject<HTMLVideoElement>} {...props} poster={m.poster}>{m.captions&&<track kind="captions" src={m.captions} srcLang="en" label="Captions" default/>}</video>;
}
