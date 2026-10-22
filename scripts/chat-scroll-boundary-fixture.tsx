import * as React from "react"
import { createRoot } from "react-dom/client"
import { useChatScrollBoundary } from "../src/features/chat/components/chat-scroll-boundary"
function Region(){
  const forwarded=React.useRef<HTMLDivElement>(null)
  const [intents,setIntents]=React.useState(0)
  const onScrollAway=React.useCallback((direction:"up"|"down")=>{if(direction==="up")setIntents(count=>count+1)},[])
  const ref=useChatScrollBoundary(forwarded,onScrollAway)
  return <div id="boundary" ref={ref} data-intents={intents} tabIndex={0} style={{width:280,height:160,overflow:"auto",border:"1px solid",paddingLeft:16,paddingRight:16}}>
    <div id="nested" data-chat-scroll-region style={{height:80,overflow:"auto",margin:8,background:"#ddd"}}><div style={{height:300}}>Nested content</div></div>
    <pre id="plain-nested" style={{height:80,overflow:"auto",margin:8}}>{"Tool output\n".repeat(40)}</pre>
    <button id="consumed-key" onKeyDown={event=>event.preventDefault()}>Control</button>
    <button id="native-key">Native Space control</button>
    <input id="text-input" defaultValue="Editable text" />
    <div style={{height:500}}>Outer content</div>
  </div>
}
function Fixture(){const [visible,setVisible]=React.useState(true);return <main style={{height:2000,padding:30}}><button id="toggle" onClick={()=>setVisible(v=>!v)}>Toggle</button>{visible?<Region/>:null}</main>}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture/></React.StrictMode>)
