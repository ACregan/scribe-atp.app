import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import type { Route } from "./+types/sites";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { Button } from "~/components/Button/Button";
import { useState, useEffect } from "react";
import { useFetcher, Link } from "react-router";
import styles from "./sites.module.css";
import {
  getAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";

const SITE_COLLECTION = "app.scribe.site";

// Domain must contain at least one dot, no spaces, valid hostname chars
const DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-._]*\.[a-zA-Z]{2,}$/;

type SiteRef = {
  rkey: string;
  cid: string;
  title: string;
  url: string;
  urlPrefix: string;
  description?: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
};

type ActionData = { ok: boolean; error?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Sites" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return {
      sites: [
        {
          rkey: "norobots-blog",
          cid: "dev-cid-s1",
          title: "NoRobots.blog",
          url: "norobots.blog",
          urlPrefix: "blog",
          description:
            "A personal blog about technology, the open web, and avoiding robots.",
          splashImageUrl: "",
          logoImageUrl: "",
        },
        {
          rkey: "perpetualsummer-ltd",
          cid: "dev-cid-s2",
          title: "Perpetual Summer LTD",
          url: "perpetualsummer.ltd",
          urlPrefix: "articles",
          description: "",
          splashImageUrl: "",
          logoImageUrl: "",
        },
      ] as SiteRef[],
    };
  }

  const agent = await getAtpAgent(did);
  const result = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SITE_COLLECTION,
    limit: 100,
  });

  const sites: SiteRef[] = result.data.records.map((record) => {
    const v = record.value as Record<string, unknown>;
    return {
      rkey: record.uri.split("/").pop()!,
      cid: record.cid,
      title: String(v.title ?? ""),
      url: String(v.url ?? ""),
      urlPrefix: String(v.urlPrefix ?? ""),
      description: v.description ? String(v.description) : undefined,
      splashImageUrl: v.splashImageUrl ? String(v.splashImageUrl) : undefined,
      logoImageUrl: v.logoImageUrl ? String(v.logoImageUrl) : undefined,
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
    const urlPrefix = (
      (formData.get("urlPrefix") as string) ?? ""
    ).trim().toLowerCase();
    const description = (
      (formData.get("description") as string) ?? ""
    ).trim();
    const splashImageUrl = (
      (formData.get("splashImageUrl") as string) ?? ""
    ).trim();
    const logoImageUrl = (
      (formData.get("logoImageUrl") as string) ?? ""
    ).trim();

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
        await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey,
          record: {
            $type: SITE_COLLECTION,
            title,
            url,
            urlPrefix,
            ...(description && { description }),
            ...(splashImageUrl && { splashImageUrl }),
            ...(logoImageUrl && { logoImageUrl }),
            contributors: [],
            groups: [],
            articles: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        return { ok: false, error: `Failed to create site: ${String(err)}` };
      }
    }

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

    return { ok: true };
  }

  return { ok: false, error: "Unknown action." };
}

export function HydrateFallback() {
  return <div>Loading…</div>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function composedUrl(site: SiteRef) {
  return site.urlPrefix ? `${site.url}/${site.urlPrefix}` : site.url;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sites({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;
  const addSiteModal = useModal();
  const deleteSiteModal = useModal();
  const [siteToDelete, setSiteToDelete] = useState<SiteRef | null>(null);

  const createFetcher = useFetcher<ActionData>();
  const deleteFetcher = useFetcher<ActionData>();

  const isCreating = createFetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";

  useEffect(() => {
    if (createFetcher.data?.ok) addSiteModal.close();
  }, [createFetcher.data, addSiteModal.close]);

  useEffect(() => {
    if (deleteFetcher.data?.ok) {
      deleteSiteModal.close();
      setSiteToDelete(null);
    }
  }, [deleteFetcher.data, deleteSiteModal.close]);

  return (
    <PageContainer
      title="Sites"
      topButtons={
        <Button type="button" onClick={addSiteModal.open}>
          Add New Site
        </Button>
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
          <ul className={styles.tileGrid}>
            {sites.map((site) => (
              <li key={site.rkey} className={styles.tile}>
                {/* Splash */}
                <div
                  className={styles.tileSplash}
                  style={
                    site.splashImageUrl
                      ? {
                          backgroundImage: `url(${site.splashImageUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                />

                {/* Body */}
                <div className={styles.tileBody}>
                  <div className={styles.tileHeader}>
                    {site.logoImageUrl && (
                      <img
                        className={styles.tileLogo}
                        src={site.logoImageUrl}
                        alt={`${site.title} logo`}
                      />
                    )}
                    <h2 className={styles.tileTitle}>{site.title}</h2>
                  </div>

                  {site.description && (
                    <p className={styles.tileDescription}>{site.description}</p>
                  )}

                  <span className={styles.tileUrl}>{composedUrl(site)}</span>
                </div>

                {/* Actions */}
                <div className={styles.tileActions}>
                  <Link to={`/article/list/${site.rkey}`}>
                    <Button type="button" variant="secondary">
                      Manage
                    </Button>
                  </Link>
                  <Link to={`/site/${site.rkey}/configure`}>
                    <Button type="button" variant="secondary">
                      Configure
                    </Button>
                  </Link>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setSiteToDelete(site);
                      deleteSiteModal.open();
                    }}
                    disabled={isDeleting}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {/* ── Add Site Modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={addSiteModal.isOpen}
        onClose={addSiteModal.close}
        title="Add New Site"
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={addSiteModal.close}
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
          <Input name="title" label="Title" placeholder="My Blog" required />
          <Input
            name="url"
            label="Domain"
            placeholder="myblog.com"
            required
          />
          <Input name="urlPrefix" label="URL Prefix" placeholder="blog" />
          <Input
            name="description"
            label="Description"
            placeholder="What this site is about…"
          />
          <Input
            name="splashImageUrl"
            label="Splash Image URL"
            placeholder="https://…"
          />
          <Input
            name="logoImageUrl"
            label="Logo Image URL"
            placeholder="https://…"
          />
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
