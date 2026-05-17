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
    route("article/create", "./routes/article/create/create.tsx"),
    route("article/list", "./routes/article/list/list.tsx"),
    route("article/edit/:rkey", "./routes/article/edit/edit.tsx"),
  ]),
] satisfies RouteConfig;
