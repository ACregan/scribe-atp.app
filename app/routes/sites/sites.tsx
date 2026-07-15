import {
  ButtonGroupContainer,
  PageContainer,
  PageContainerHeading,
  PageSection,
  PageSectionCell,
} from "~/components/PageContainer/PageContainer";
import type { Route } from "./+types/sites";
import { Input } from "~/components/Input/Input";
import { ImagePicker } from "~/components/ImagePicker/ImagePicker";
import { Spinner } from "~/components/Spinner/Spinner";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { Button } from "~/components/Button/Button";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";
import { useToast } from "~/components/Toast/ToastContext";
import styles from "./sites.module.css";
import {
  getAtpAgent,
  requireAuth,
  rethrowIfRedirect,
  useRealOAuth,
} from "~/services/auth.server";
import { devSitesLoader } from "~/services/devFixtures.server";
import { SiteTile } from "~/components/SiteTile/SiteTile";
import { type SiteCard } from "~/components/types";

import { DOMAIN_RE, SITE_COLLECTION } from "~/constants";
import { resolveThumbUrl } from "~/services/article.server";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import SiteListItem from "~/components/SiteListItem/SiteListItem";
import { useTheme } from "~/context/ThemeContext";
import { logger } from "~/services/logger.server";
import {
  createSite as createSiteRecord,
  deleteSite as deleteSiteRecord,
  listSites,
} from "~/services/siteRepository.server";
import { deleteUmamiConfig } from "~/services/umami.server";
import { registerSocialOrigin } from "~/services/socialOrigin.server";
import { syncSiteRoster } from "~/services/imageServiceClient.server";
import { pendingSubmissions } from "~/services/db.server";

type ActionData = { ok: boolean; error?: string; iconWarning?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Sites" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) return devSitesLoader();

  const agent = await getAtpAgent(did, request);
  const records = await listSites(agent, did);

  // Phase 4 (discovery UX polish) — a purely local SQLite read, no
  // network, cheap to do on every /sites visit.
  const submissionCountBySiteUri = new Map<string, number>();
  for (const s of pendingSubmissions.listForOwner(did)) {
    if (s.status !== "pending") continue;
    submissionCountBySiteUri.set(
      s.siteUri,
      (submissionCountBySiteUri.get(s.siteUri) ?? 0) + 1,
    );
  }

  const sites: SiteCard[] = records
    .filter((record) => record.value.scribe != null)
    .map((record) => {
      const scribe = (record.value.scribe as Record<string, unknown>) ?? {};
      const groups = (scribe.groups as Array<{ articles: unknown[] }>) ?? [];
      const topArticles = (scribe.ungroupedArticles as unknown[]) ?? [];
      return {
        rkey: record.rkey,
        cid: record.cid,
        title: String(scribe.title ?? ""),
        url: String(scribe.domain ?? ""),
        urlPrefix: String(scribe.basePath ?? ""),
        description: scribe.description
          ? String(scribe.description)
          : undefined,
        splashImageUrl: scribe.splashImageUrl
          ? String(scribe.splashImageUrl)
          : undefined,
        logoImageUrl: scribe.logoImageUrl
          ? String(scribe.logoImageUrl)
          : undefined,
        groupCount: groups.length,
        articleCount:
          groups.reduce((sum, g) => sum + (g.articles?.length ?? 0), 0) +
          topArticles.length,
        pendingSubmissionCount: submissionCountBySiteUri.get(record.uri) ?? 0,
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

    let iconUploadFailed = false;

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did, request);
        const now = new Date().toISOString();

        // Upload the logo as a blob for the top-level `icon` field — mirrors
        // the same logic in configure.tsx so a site's icon blob is set from
        // the instant it's created, not only after a later Configure save.
        let iconBlobRef: unknown;
        if (logoImageUrl) {
          try {
            const thumbSrc = resolveThumbUrl(logoImageUrl);
            let imgRes = await fetch(thumbSrc);
            if (!imgRes.ok && thumbSrc !== logoImageUrl) {
              imgRes = await fetch(logoImageUrl);
            }
            if (imgRes.ok) {
              const imgBuffer = await imgRes.arrayBuffer();
              const mimeType =
                imgRes.headers.get("content-type") ?? "image/webp";
              const uploadRes = await agent.uploadBlob(
                new Uint8Array(imgBuffer),
                {
                  encoding: mimeType,
                },
              );
              iconBlobRef = uploadRes.data.blob;
            } else {
              iconUploadFailed = true;
            }
          } catch (blobErr) {
            logger.warn(
              {
                event: "site.create.icon_blob_error",
                error: String(blobErr),
              },
              "icon blob upload error — save will proceed without icon",
            );
            iconUploadFailed = true;
          }
        }

        // rkey is not passed explicitly — the PDS generates a TID, per the
        // site.standard.publication lexicon's "key": "tid" requirement (see
        // the 2026-06-25 publication TID migration).
        const result = await createSiteRecord(agent, did, {
          $type: SITE_COLLECTION,
          url: `https://${url}`,
          name: title,
          preferences: { showInDiscover },
          ...(iconBlobRef !== undefined && { icon: iconBlobRef }),
          scribe: {
            domain: url,
            basePath: urlPrefix,
            title,
            ...(description && { description }),
            ...(splashImageUrl && { splashImageUrl }),
            ...(logoImageUrl && { logoImageUrl }),
            ...(iconBlobRef !== undefined && { logoImageBlob: iconBlobRef }),
            contributors: [],
            groups: [],
            ungroupedArticles: [],
            createdAt: now,
            updatedAt: now,
          },
        });
        const rkey = result.uri.split("/").pop()!;
        logger.info(
          { event: "site.create", user_did: did, rkey, url },
          "site.create",
        );
        await registerSocialOrigin(url, did);

        // ADR 0020 point 6 — creates the site's shared Image Library folder
        // (empty roster; the Owner already has access via site_uri parsing
        // alone). Best-effort: if the Image Service is unreachable, site
        // creation still succeeds — self-corrects on the next sync call for
        // this site (e.g. the first Contributor invite).
        try {
          await syncSiteRoster(
            `at://${did}/${SITE_COLLECTION}/${rkey}`,
            url,
            [],
            request.headers.get("Cookie") ?? "",
          );
        } catch (imageServiceErr) {
          logger.warn(
            {
              event: "site.create.image_folder_sync_failed",
              user_did: did,
              rkey,
              error: String(imageServiceErr),
            },
            "Image Service site-folder creation failed — will self-correct on next sync",
          );
        }
      } catch (err) {
        rethrowIfRedirect(err);
        return { ok: false, error: `Failed to create site: ${String(err)}` };
      }
    }

    return {
      ok: true,
      ...(iconUploadFailed
        ? {
            iconWarning:
              "Icon could not be uploaded — it will be set on the next Configure save.",
          }
        : {}),
    };
  }

  if (intent === "deleteSite") {
    const rkey = formData.get("rkey") as string;
    const cid = (formData.get("cid") as string | null) || undefined;

    if (!rkey) return { ok: false, error: "Missing site ID." };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did, request);
        await deleteSiteRecord(agent, did, rkey, cid);
      } catch (err) {
        rethrowIfRedirect(err);
        return { ok: false, error: `Failed to delete site: ${String(err)}` };
      }
    }

    // Umami config lives in a local table, not the PDS record (ADR 0010) —
    // deleting the site record doesn't clean it up on its own.
    deleteUmamiConfig(did, rkey);

    logger.info({ event: "site.delete", user_did: did, rkey }, "site.delete");
    return { ok: true };
  }

  return { ok: false, error: "Unknown action." };
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

function FieldWithHelp({
  children,
  help,
}: {
  children: ReactNode;
  help: string;
}) {
  return (
    <div className={styles.fieldRow}>
      {children}
      <p className={styles.fieldHelp}>{help}</p>
    </div>
  );
}

export default function Sites({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;
  const addSiteModal = useModal();
  const deleteSiteModal = useModal();
  const [siteToDelete, setSiteToDelete] = useState<SiteCard | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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
    if (createFetcher.data.iconWarning) {
      addToast({
        heading: "Icon not uploaded",
        content: createFetcher.data.iconWarning,
        variant: "primary",
        autoExpire: false,
      });
    }
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
    setDeleteConfirmText("");
  }, [deleteFetcher.data, deleteSiteModal.close]);

  function handleOpenDeleteModal(site: SiteCard) {
    setSiteToDelete(site);
    setDeleteConfirmText("");
    deleteSiteModal.open();
  }

  function handleCloseDeleteModal() {
    deleteSiteModal.close();
    setDeleteConfirmText("");
  }

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
                  onDelete={handleOpenDeleteModal}
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
                  onDelete={handleOpenDeleteModal}
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
        style={{ maxWidth: "84rem" }}
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
          <FieldWithHelp help="The display name for your site — shown on the Sites page and used as the default page title.">
            <Input
              id="title"
              name="title"
              label="Title"
              placeholder="My Blog"
              required
            />
          </FieldWithHelp>
          <FieldWithHelp help="Your site's domain name, exactly as visitors would type it — e.g. myblog.com. This should match where your site is actually hosted.">
            <Input
              id="url"
              name="url"
              label="Domain"
              placeholder="myblog.com"
              required
            />
          </FieldWithHelp>
          <FieldWithHelp help="Only needed if your articles live under a subpath rather than the domain root — e.g. blog if your articles are at myblog.com/blog. Leave blank if they're at the root.">
            <Input
              id="urlPrefix"
              name="urlPrefix"
              label="URL Prefix"
              placeholder="blog"
            />
          </FieldWithHelp>
          <FieldWithHelp help="A short summary of your site, shown on the Sites page.">
            <Input
              id="description"
              name="description"
              label="Description"
              placeholder="What this site is about…"
            />
          </FieldWithHelp>
          <FieldWithHelp help="A wide banner image for your site, shown as the background of its tile on the Sites page.">
            <ImagePicker name="splashImageUrl" label="Splash Image" />
          </FieldWithHelp>
          <FieldWithHelp help="A square logo or icon for your site, shown alongside the splash image.">
            <ImagePicker
              name="logoImageUrl"
              label="Logo Image"
              variant="square"
            />
          </FieldWithHelp>
          <FieldWithHelp help="Marks your site as discoverable by other apps on the open ATproto network.">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                fontSize: "1.4rem",
              }}
            >
              <input type="checkbox" name="showInDiscover" defaultChecked />
              Show in Discover
            </label>
          </FieldWithHelp>
          {createFetcher.data?.error && (
            <p className={styles.errorMessage}>{createFetcher.data.error}</p>
          )}
        </createFetcher.Form>
      </Modal>

      {/* ── Delete Site Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={deleteSiteModal.isOpen}
        onClose={handleCloseDeleteModal}
        title="Delete Site"
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={handleCloseDeleteModal}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="delete-site-form"
              variant="danger"
              disabled={isDeleting || deleteConfirmText !== siteToDelete?.url}
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
          <Input
            id="deleteConfirm"
            name="deleteConfirm"
            label={`Type "${siteToDelete?.url ?? ""}" to confirm`}
            placeholder={siteToDelete?.url}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            autoComplete="off"
          />
          {deleteFetcher.data?.error && (
            <p className={styles.errorMessage}>{deleteFetcher.data.error}</p>
          )}
        </deleteFetcher.Form>
      </Modal>
    </PageContainer>
  );
}
