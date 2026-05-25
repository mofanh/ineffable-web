import * as React from "react"

type AppHeaderContent = {
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

type AppHeaderContextValue = {
  headerContent: AppHeaderContent | null
  setHeaderContent: (content: AppHeaderContent | null) => void
}

const AppHeaderContext = React.createContext<AppHeaderContextValue | null>(null)

export function AppHeaderProvider({ children }: { children: React.ReactNode }) {
  const [headerContent, setHeaderContent] =
    React.useState<AppHeaderContent | null>(null)

  const value = React.useMemo(
    () => ({ headerContent, setHeaderContent }),
    [headerContent]
  )

  return (
    <AppHeaderContext.Provider value={value}>
      {children}
    </AppHeaderContext.Provider>
  )
}

export function useAppHeader() {
  const context = React.useContext(AppHeaderContext)
  if (!context) {
    throw new Error("useAppHeader must be used within AppHeaderProvider")
  }

  return context
}
