import { AppShell } from "@/app/app-shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppConfirmProvider } from "@/lib/app/confirm"

export default function App() {
  return (
    <AppConfirmProvider>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </AppConfirmProvider>
  )
}
