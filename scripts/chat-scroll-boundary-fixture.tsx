import * as React from "react"
import { createRoot } from "react-dom/client"
import { useChatScrollBoundary } from "../src/features/chat/components/chat-scroll-boundary"
function Region(){
  const forwarded=React.useRef<HTMLDivElement>(null)
  const ref=useChatScrollBoundary(forwarded)
  return <div id="boundary" ref={ref} style={{width:280,height:160,overflow:"auto",border:"1px solid"}}>
    <div id="nested" data-chat-scroll-region style={{height:80,overflow:"auto",margin:8,background:"#ddd"}}><div style={{height:300}}>Nested content</div></div>
    <div style={{height:500}}>Outer content</div>
  </div>
}
function Fixture(){const [visible,setVisible]=React.useState(true);return <main style={{height:2000,padding:30}}><button id="toggle" onClick={()=>setVisible(v=>!v)}>Toggle</button>{visible?<Region/>:null}</main>}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture/></React.StrictMode>)
