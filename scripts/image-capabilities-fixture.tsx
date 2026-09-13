import * as React from "react"
import { createRoot } from "react-dom/client"
import "../src/index.css"
import "../src/lib/i18n/i18n"
import { useImageAttachments } from "../src/features/chat/model/use-image-attachments"
import { ImageAttachments } from "../src/features/chat/components/image-attachments"
import { ImageGallery } from "../src/components/app/image-gallery"

function Fixture() {
  const [scope, setScope] = React.useState("a")
  const [token, setToken] = React.useState("image-fixture-token")
  const draft = useImageAttachments(scope, token, "00000000-0000-0000-0000-000000000001")
  return <main style={{ padding: 16 }}>
    <button onClick={() => setScope(scope === "a" ? "b" : "a")}>switch</button>
    <button onClick={() => { draft.moveTo("created"); setScope("created") }}>create</button>
    <button onClick={() => setScope("a")}>new</button>
    <button onClick={() => setScope("created")}>old</button>
    <button onClick={() => setToken("refreshed-fixture-token")}>refresh-token</button>
    <output data-scope>{scope}</output><output data-count>{draft.images.length}</output>
    <ImageAttachments items={draft.items} accessToken="image-fixture-token" enabled onFiles={draft.addFiles} onRemove={draft.remove} onRetry={(item) => void draft.retry(item)} />
    <ImageGallery images={draft.images} accessToken="image-fixture-token" />
  </main>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
