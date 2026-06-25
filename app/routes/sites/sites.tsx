import {
  ButtonGroupContainer,
  PageContainer,
  PageContainerHeading,
  PageSection,
  PageSectionCell,
} from "~/components/PageContainer/PageContainer";
import type { Route } from "./+types/sites";
import { Input } from "~/components/Input/Input";
import { Spinner } from "~/components/Spinner/Spinner";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { Button } from "~/components/Button/Button";
import { useState, useEffect, useRef } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";
import { useToast } from "~/components/Toast/ToastContext";
import styles from "./sites.module.css";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { devSitesLoader } from "~/services/devFixtures.server";
import { SiteTile } from "~/components/SiteTile/SiteTile";
import { type SiteCard } from "~/components/types";

import { SITE_COLLECTION, DOMAIN_RE } from "~/constants";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import SiteListItem from "~/components/SiteListItem/SiteListItem";
import { useTheme } from "~/context/ThemeContext";
import { logger } from "~/services/logger.server";

type ActionData = { ok: boolean; error?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Sites" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) return devSitesLoader();

  const agent = await getAtpAgent(did);
  const result = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SITE_COLLECTION,
    limit: 100,
  });

  const sites: SiteCard[] = result.data.records
    .filter((record) => (record.value as Record<string, unknown>).scribe != null)
    .map((record) => {
    const v = record.value as Record<string, unknown>;
    const scribe = (v.scribe as Record<string, unknown>) ?? {};
    const groups = (scribe.groups as Array<{ articles: unknown[] }>) ?? [];
    const topArticles = (scribe.ungroupedArticles as unknown[]) ?? [];
    return {
      rkey: record.uri.split("/").pop()!,
      cid: record.cid,
      title: String(scribe.title ?? ""),
      url: String(scribe.domain ?? ""),
      urlPrefix: String(scribe.basePath ?? ""),
      description: scribe.description ? String(scribe.description) : undefined,
      splashImageUrl: scribe.splashImageUrl ? String(scribe.splashImageUrl) : undefined,
      logoImageUrl: scribe.logoImageUrl ? String(scribe.logoImageUrl) : undefined,
      groupCount: groups.length,
      articleCount:
        groups.reduce((sum, g) => sum + (g.articles?.length ?? 0), 0) +
        topArticles.length,
    };
  });

  return { sites };
}

export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("_intent") as string;

  if (intent === "createSite") {
    const title = (formData.get("title") as string)?.trim();
    const url = (formData.get("url") as string)?.trim().toLowerCase();
    const urlPrefix = ((formData.get("urlPrefix") as string) ?? "")
      .trim()
      .toLowerCase();
    const description = ((formData.get("description") as string) ?? "").trim();
    const splashImageUrl = (
      (formData.get("splashImageUrl") as string) ?? ""
    ).trim();
    const logoImageUrl = (
      (formData.get("logoImageUrl") as string) ?? ""
    ).trim();
    const showInDiscover = formData.get("showInDiscover") === "on";

    if (!title) return { ok: false, error: "Title is required." };
    if (!url) return { ok: false, error: "Domain is required." };
    if (!DOMAIN_RE.test(url))
      return {
        ok: false,
        error: "Domain must be a valid hostname (e.g. myblog.com).",
      };

    const rkey = url.replace(/\./g, "-").replace(/[^a-z0-9-]/g, "");
    if (!rkey)
      return {
        ok: false,
        error: "Domain must contain at least one letter or number.",
      };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        const now = new Date().toISOString();
        await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey,
          record: {
            $type: SITE_COLLECTION,
            url: `https://${url}`,
            name: title,
            preferences: { showInDiscover },
            scribe: {
              $type: SITE_COLLECTION,
              domain: url,
              basePath: urlPrefix,
              title,
              ...(description && { description }),
              ...(splashImageUrl && { splashImageUrl }),
              ...(logoImageUrl && { logoImageUrl }),
              contributors: [],
              groups: [],
              ungroupedArticles: [],
              createdAt: now,
              updatedAt: now,
            },
          },
        });
      } catch (err) {
        return { ok: false, error: `Failed to create site: ${String(err)}` };
      }
    }

    logger.info(
      { event: "site.create", user_did: did, rkey, url },
      "site.create",
    );
    return { ok: true };
  }

  if (intent === "deleteSite") {
    const rkey = formData.get("rkey") as string;
    const cid = (formData.get("cid") as string | null) || undefined;

    if (!rkey) return { ok: false, error: "Missing site ID." };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        await agent.com.atproto.repo.deleteRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey,
          swapRecord: cid,
        });
      } catch (err) {
        return { ok: false, error: `Failed to delete site: ${String(err)}` };
      }
    }

    logger.info({ event: "site.delete", user_did: did, rkey }, "site.delete");
    return { ok: true };
  }

  return { ok: false, error: "Unknown action." };
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sites({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;
  const addSiteModal = useModal();
  const deleteSiteModal = useModal();
  const [siteToDelete, setSiteToDelete] = useState<SiteCard | null>(null);

  const createFetcher = useFetcher<ActionData>();
  const deleteFetcher = useFetcher<ActionData>();

  const isCreating = createFetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";

  const { addToast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isNewRoute = pathname === "/sites/new";

  // Auto-open when landing on /sites/new
  const openedByRouteRef = useRef(false);
  useEffect(() => {
    if (isNewRoute && !openedByRouteRef.current) {
      openedByRouteRef.current = true;
      addSiteModal.open();
    }
    if (!isNewRoute) {
      openedByRouteRef.current = false;
    }
  }, [isNewRoute]);

  function handleCloseAddModal() {
    addSiteModal.close();
    if (isNewRoute) navigate("/sites", { replace: true });
  }

  useEffect(() => {
    if (!createFetcher.data?.ok) return;
    handleCloseAddModal();
    addToast({ heading: "Site created", variant: "success" });
  }, [createFetcher.data]);

  useEffect(() => {
    if (!deleteFetcher.data?.ok) return;
    addToast({
      heading: "Site deleted",
      content: siteToDelete?.title,
      variant: "primary",
    });
    deleteSiteModal.close();
    setSiteToDelete(null);
  }, [deleteFetcher.data, deleteSiteModal.close]);

  const [viewType, setViewType] = useState<"list" | "tiles">("tiles");

  const { theme } = useTheme();
  const darkMode = theme === "dark";

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Website}>
          Sites
        </PageContainerHeading>
      }
      topButtons={
        <>
          <Button type="button" onClick={addSiteModal.open}>
            Add New Site
          </Button>
          <ButtonGroupContainer>
            <Button
              className={styles.viewToggleButton}
              type="button"
              onClick={() => setViewType("tiles")}
              variant={viewType === "tiles" ? "primary" : "secondary"}
            >
              <SvgIcon
                name={SvgImageList.Tiles}
                fill={
                  viewType === "tiles"
                    ? "var(--white)"
                    : darkMode
                      ? "var(--flamingo)"
                      : "var(--blue-ribbon)"
                }
              />
            </Button>
            <Button
              className={styles.viewToggleButton}
              type="button"
              onClick={() => setViewType("list")}
              variant={viewType === "list" ? "primary" : "secondary"}
            >
              <SvgIcon
                name={SvgImageList.List}
                fill={
                  viewType === "list"
                    ? "var(--white)"
                    : darkMode
                      ? "var(--flamingo)"
                      : "var(--blue-ribbon)"
                }
              />
            </Button>
          </ButtonGroupContainer>
        </>
      }
    >
      <PageSection>
        {sites.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>No sites yet.</p>
            <p className={styles.emptyStateBody}>
              Click <strong>Add New Site</strong> to create your first site.
              Once created you can add articles, organise them into groups, and
              configure how they appear to readers.
            </p>
          </div>
        ) : (
          <>
            <ul
              className={styles.tileGrid}
              style={viewType !== "tiles" ? { display: "none" } : undefined}
            >
              {sites.map((site) => (
                <SiteTile
                  key={site.rkey}
                  site={site}
                  onDelete={(s) => {
                    setSiteToDelete(s);
                    deleteSiteModal.open();
                  }}
                  isDeleting={isDeleting}
                />
              ))}
            </ul>
            <ul
              className={styles.listGrid}
              style={viewType !== "list" ? { display: "none" } : undefined}
            >
              {sites.map((site) => (
                <SiteListItem
                  key={site.rkey}
                  site={site}
                  onDelete={(s) => {
                    setSiteToDelete(s);
                    deleteSiteModal.open();
                  }}
                  isDeleting={isDeleting}
                />
              ))}
            </ul>
          </>
        )}
      </PageSection>

      {/* ── Add Site Modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={addSiteModal.isOpen}
        onClose={handleCloseAddModal}
        title="Add New Site"
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={handleCloseAddModal}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" form="add-site-form" disabled={isCreating}>
              {isCreating ? "Adding…" : "Add Site"}
            </Button>
          </div>
        }
      >
        <createFetcher.Form
          id="add-site-form"
          method="post"
          className={styles.siteForm}
        >
          <input type="hidden" name="_intent" value="createSite" />
          <Input
            id="title"
            name="title"
            label="Title"
            placeholder="My Blog"
            required
          />
          <Input
            id="url"
            name="url"
            label="Domain"
            placeholder="myblog.com"
            required
          />
          <Input
            id="urlPrefix"
            name="urlPrefix"
            label="URL Prefix"
            placeholder="blog"
          />
          <Input
            id="description"
            name="description"
            label="Description"
            placeholder="What this site is about…"
          />
          <Input
            id="splashImageUrl"
            name="splashImageUrl"
            label="Splash Image URL"
            placeholder="https://…"
          />
          <Input
            id="logoImageUrl"
            name="logoImageUrl"
            label="Logo Image URL"
            placeholder="https://…"
          />
          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.4rem" }}>
            <input type="checkbox" name="showInDiscover" defaultChecked />
            Show in Discover
          </label>
          {createFetcher.data?.error && (
            <p className={styles.errorMessage}>{createFetcher.data.error}</p>
          )}
        </createFetcher.Form>
      </Modal>

      {/* ── Delete Site Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={deleteSiteModal.isOpen}
        onClose={deleteSiteModal.close}
        title="Delete Site"
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={deleteSiteModal.close}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="delete-site-form"
              variant="danger"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete Site"}
            </Button>
          </div>
        }
      >
        <deleteFetcher.Form id="delete-site-form" method="post">
          <input type="hidden" name="_intent" value="deleteSite" />
          <input type="hidden" name="rkey" value={siteToDelete?.rkey ?? ""} />
          <input type="hidden" name="cid" value={siteToDelete?.cid ?? ""} />
          <p>
            Are you sure you want to delete{" "}
            <strong>{siteToDelete?.title}</strong>?
          </p>
          <p className={styles.deleteWarning}>
            This removes the site and its group structure. Articles are not
            deleted from your PDS.
          </p>
          {deleteFetcher.data?.error && (
            <p className={styles.errorMessage}>{deleteFetcher.data.error}</p>
          )}
        </deleteFetcher.Form>
      </Modal>
    </PageContainer>
  );
}
