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
      route("groups/new", "./routes/groups/groups.tsx", { id: "groups-new" }),
      route("sites", "./routes/sites/sites.tsx"),
      route("sites/new", "./routes/sites/sites.tsx", { id: "sites-new" }),
      route(
        "site/:siteSlug/configure",
        "./routes/site/configure/configure.tsx",
      ),
      route("images", "./routes/images/images.tsx"),
      route(
        "devtools/migrate",
        "./routes/devtools/migrate/migrate.tsx",
      ),
      route(
        "devtools/migrate-publication",
        "./routes/devtools/migrate-publication/migrate-publication.tsx",
      ),
      route(
        "devtools/migrate-document-rkeys",
        "./routes/devtools/migrate-document-rkeys/migrate-document-rkeys.tsx",
      ),
      route(
        "devtools/repair-publication-refs",
        "./routes/devtools/repair-publication-refs/repair-publication-refs.tsx",
      ),
    ]),
  ]),
] satisfies RouteConfig;
