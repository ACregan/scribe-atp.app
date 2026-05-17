import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("./layout/core/core.tsx", [
    index("./routes/home/home.tsx"),
    route("login", "./routes/login/login.tsx"),
    route("auth/callback", "./routes/auth/callback.tsx"),
    route("logout", "./routes/auth/logout.tsx"),
    layout("./layout/protected/protected.tsx", [
      route("article/create", "./routes/article/create/create.tsx"),
      route("article/list", "./routes/article/list/list.tsx"),
      route("article/edit/:articleUrl", "./routes/article/edit/edit.tsx"),
      route("article/view/:articleUrl", "./routes/article/view/view.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
