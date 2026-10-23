import * as React from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom"
import { FormField, FormControl } from "../src/components/app/form"
import { Input } from "../src/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../src/components/ui/select"
import { AppSessionProvider, useAppSession } from "../src/features/auth/app-session"
import { SandboxPreviewLaunchPage } from "../src/pages/sandbox-preview-launch-page"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
const exposure="00000000-0000-4000-8000-000000000001"
function Harness() {
  const session=useAppSession(), navigate=useNavigate()
  Object.assign(window,{session,navigate})
  return <Routes><Route path="/sandbox-preview/:exposureId" element={<SandboxPreviewLaunchPage/>}/><Route path="*" element={<p>Unmounted</p>}/></Routes>
}
function Fields(){return <main>
  {[1,2].map(n=><FormField key={n} label={`Name ${n}`} description={`Description ${n}`} error={n===1?"Invalid name":null}><FormControl><Input/></FormControl></FormField>)}
  <FormField label="Choice"><Select defaultValue="one"><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="one">One</SelectItem></SelectContent></Select></FormField>
  <FormField group label="Range"><Input aria-label="From"/><Input aria-label="To"/></FormField>
</main>}
await i18n.changeLanguage("en")
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("preview")?
 <React.StrictMode><MemoryRouter initialEntries={[`/sandbox-preview/${exposure}`]}><AppSessionProvider><Harness/></AppSessionProvider></MemoryRouter></React.StrictMode>:<Fields/>)
