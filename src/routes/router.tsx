import { Navigate, createBrowserRouter } from "react-router-dom"

import App from "@/App"
import { allRouteMeta, defaultPath } from "@/routes/navigation"

function RoutePage({ title }: { title: string }) {
  return (
    <>
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="bg-muted/50 aspect-video rounded-xl p-4">
          <p className="text-sm font-medium">核心指标</p>
          <p className="text-muted-foreground mt-2 text-sm">{title}</p>
        </div>
        <div className="bg-muted/50 aspect-video rounded-xl p-4">
          <p className="text-sm font-medium">最近活动</p>
          <p className="text-muted-foreground mt-2 text-sm">按当前页面路径渲染</p>
        </div>
        <div className="bg-muted/50 aspect-video rounded-xl p-4">
          <p className="text-sm font-medium">系统状态</p>
          <p className="text-muted-foreground mt-2 text-sm">导航、URL 与面包屑已联动</p>
        </div>
      </div>
      <div className="bg-muted/50 min-h-screen flex-1 rounded-xl p-4 md:min-h-min">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          当前页面内容通过路由在布局内容区内渲染展示。
        </p>
      </div>
    </>
  )
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <Navigate to={defaultPath} replace />,
      },
      ...allRouteMeta.map((route) => ({
        path: route.path.replace(/^\//, ""),
        element: <RoutePage title={route.title} />,
      })),
      {
        path: "*",
        element: <Navigate to={defaultPath} replace />,
      },
    ],
  },
])
