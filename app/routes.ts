import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  route("client-metadata.json", "./routes/client-metadata.ts"),
  layout("./layout/core/core.tsx", [
    index("./routes/home/home.tsx"),
    route("login", "./routes/login/login.tsx"),
    route("auth/callback", "./routes/auth/callback.tsx"),
    route("logout", "./routes/auth/logout.tsx"),
    layout("./layout/protected/protected.tsx", [
      route("article/create", "./routes/article/create/create.tsx"),
      route("article/list", "./routes/article/list/list.tsx"),
      route(
        "article/list/:siteSlug",
        "./routes/article/site-list/site-list.tsx",
      ),
      route(
        "article/list/:siteSlug/new",
        "./routes/article/site-list/site-list.tsx",
        { id: "site-list-new" },
      ),
      route("article/edit/:articleUrl", "./routes/article/edit/edit.tsx"),
      route("article/view/:articleUrl", "./routes/article/view/view.tsx"),
      route("groups", "./routes/groups/groups.tsx"),
      route("sites", "./routes/sites/sites.tsx"),
      route("sites/new", "./routes/sites/sites.tsx", { id: "sites-new" }),
      route(
        "site/:siteSlug/configure",
        "./routes/site/configure/configure.tsx",
      ),
    ]),
  ]),
] satisfies RouteConfig;
