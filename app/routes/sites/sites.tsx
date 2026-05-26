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

type SiteRef = {
  rkey: string;
  cid: string;
  url: string;
  title: string;
  urlPrefix: string;
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
          url: "norobots.blog",
          title: "NoRobots.blog",
          urlPrefix: "blog",
        },
        {
          rkey: "perpetualsummer-ltd",
          cid: "dev-cid-s2",
          url: "perpetualsummer.ltd",
          title: "Perpetual Summer LTD",
          urlPrefix: "articles",
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
    const value = record.value as Record<string, unknown>;
    return {
      rkey: record.uri.split("/").pop()!,
      cid: record.cid,
      url: String(value.url ?? ""),
      title: String(value.title ?? ""),
      urlPrefix: String(value.urlPrefix ?? ""),
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
    const urlPrefix =
      ((formData.get("urlPrefix") as string) ?? "").trim().toLowerCase();

    if (!title) return { ok: false, error: "Title is required." };
    if (!url) return { ok: false, error: "URL is required." };

    const rkey = url.replace(/\./g, "-").replace(/[^a-z0-9-]/g, "");
    if (!rkey)
      return {
        ok: false,
        error: "URL must contain at least one letter or number.",
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
            url,
            title,
            urlPrefix,
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
  return <div>Loading...</div>;
}

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
    if (createFetcher.data?.ok) {
      addSiteModal.close();
    }
  }, [createFetcher.data, addSiteModal.close]);

  useEffect(() => {
    if (deleteFetcher.data?.ok) {
      deleteSiteModal.close();
      setSiteToDelete(null);
    }
  }, [deleteFetcher.data, deleteSiteModal.close]);

  const handleDeleteClick = (site: SiteRef) => {
    setSiteToDelete(site);
    deleteSiteModal.open();
  };

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
          <p className={styles.emptyState}>
            No sites yet. Click &ldquo;Add New Site&rdquo; to get started.
          </p>
        ) : (
          <ul className={styles.siteList}>
            {sites.map((site) => (
              <li key={site.rkey} className={styles.siteItem}>
                <div className={styles.siteInfo}>
                  <strong className={styles.siteTitle}>{site.title}</strong>
                  <span className={styles.siteUrl}>{site.url}</span>
                  {site.urlPrefix && (
                    <span className={styles.siteUrlPrefix}>
                      /{site.urlPrefix}
                    </span>
                  )}
                </div>
                <div className={styles.siteActions}>
                  <Link to={`/article/list/${site.rkey}`}>
                    <Button type="button">Manage</Button>
                  </Link>
                  <Button
                    variant="danger"
                    onClick={() => handleDeleteClick(site)}
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
        <createFetcher.Form id="add-site-form" method="post">
          <input type="hidden" name="_intent" value="createSite" />
          <Input
            name="title"
            label="Title"
            placeholder="My Blog"
            required
          />
          <Input
            name="url"
            label="URL"
            placeholder="myblog.com"
            required
          />
          <Input
            name="urlPrefix"
            label="URL Prefix"
            placeholder="blog"
          />
          {createFetcher.data?.error && (
            <p className={styles.errorMessage}>{createFetcher.data.error}</p>
          )}
        </createFetcher.Form>
      </Modal>

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
