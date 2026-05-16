import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("./layout/core/core.tsx", [
    index("./routes/home/home.tsx"),
    route("login", "./routes/login/login.tsx", [
      route("callback", "./routes/login/callback.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
