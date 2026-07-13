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
      route(
        "article/resolve-contributor",
        "./routes/article/resolve-contributor/resolve-contributor.tsx",
      ),
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
      route("insights", "./routes/insights/insights.tsx"),
      // The one-time schema/rkey migration tools that used to live here
      // (migrate, migrate-publication, migrate-document-rkeys,
      // migrate-publication-rkeys, migrate-spec-compliance,
      // migrate-records-v2) have all completed their migrations and were
      // removed entirely — see backlog-test-coverage-gaps memory. The
      // remaining ongoing repair tools below are admin-only
      // (requireAdminAtpAgent, gated on ADMIN_DID).
      route(
        "devtools/repair-publication-refs",
        "./routes/devtools/repair-publication-refs/repair-publication-refs.tsx",
      ),
      route(
        "devtools/repair-document-site-uris",
        "./routes/devtools/repair-document-site-uris/repair-document-site-uris.tsx",
      ),
      route(
        "devtools/repair-document-paths",
        "./routes/devtools/repair-document-paths/repair-document-paths.tsx",
      ),
      // One-time Phase 1 migration tool for ADR 0013 — resets site/
      // publishedAt/scribe.canonicalUrl/scribe.domain to the loose state on
      // every currently-unassigned document. Retire once the migration is
      // complete (see docs/adr/0013-document-site-field-is-the-loose-vs-published-signal.md).
      route(
        "devtools/repair-loose-documents",
        "./routes/devtools/repair-loose-documents/repair-loose-documents.tsx",
      ),
      // One-time backfill for records saved before sanitizeArticleHtml()
      // (article.server.ts) started stripping the CMS's own CSS-Modules
      // editor classes out of saved content.html. Retire once run against
      // production.
      route(
        "devtools/repair-article-html-classes",
        "./routes/devtools/repair-article-html-classes/repair-article-html-classes.tsx",
      ),
    ]),
  ]),
] satisfies RouteConfig;
