import {
  useNavigate,
  useBlocker,
  useFetcher,
  type BlockerFunction,
} from "react-router";
import { useEffect, useState, useMemo } from "react";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { Input } from "~/components/Input/Input";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import {
  getAtpAgent,
  requireAuth,
  rethrowIfRedirect,
  useRealOAuth,
} from "~/services/auth.server";
import { devConfigureLoader } from "~/services/devFixtures.server";
import type { Route } from "./+types/configure";
import styles from "./configure.module.css";
import { useToast } from "~/components/Toast/ToastContext";

import { DOMAIN_RE, IMAGE_URL_RE, SITE_COLLECTION } from "~/constants";
import { logger } from "~/services/logger.server";
import { getSite, putSite } from "~/services/siteRepository.server";
import {
  listDocuments,
  putDocument,
} from "~/services/documentRepository.server";
import { resolveThumbUrl } from "~/services/article.server";
import { registerSocialOrigin } from "~/services/socialOrigin.server";
import { syncSiteRoster } from "~/services/imageServiceClient.server";
import type { SiteContributor } from "~/hooks/types";
import {
  getUmamiConfig,
  saveUmamiConfig,
  deleteUmamiConfig,
  testUmamiConnection,
} from "~/services/umami.server";
import { Spinner } from "~/components/Spinner/Spinner";

// ── Loader ────────────────────────────────────────────────────────────────────

type UmamiStatus =
  | {
      configured: true;
      baseUrl: string;
      websiteId: string;
      websiteName: string;
      username: string;
    }
  | { configured: false };

export async function loader({ request, params }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);
  const { siteSlug } = params;

  if (!useRealOAuth) return devConfigureLoader(siteSlug);

  const agent = await getAtpAgent(did, request);
  const record = await getSite(agent, did, siteSlug);

  const v = record.value;
  const scribe = (v.scribe as Record<string, unknown>) ?? {};
  const prefs = (v.preferences as Record<string, unknown>) ?? {};

  const umamiConfig = getUmamiConfig(did, siteSlug);
  const umami: UmamiStatus = umamiConfig
    ? {
        configured: true,
        baseUrl: umamiConfig.baseUrl,
        websiteId: umamiConfig.websiteId,
        websiteName: umamiConfig.websiteName,
        username: umamiConfig.username,
      }
    : { configured: false };

  return {
    site: {
      rkey: siteSlug,
      title: String(scribe.title ?? ""),
      url: String(scribe.domain ?? ""),
      urlPrefix: String(scribe.basePath ?? ""),
      description: String(v.description ?? scribe.description ?? ""),
      splashImageUrl: String(scribe.splashImageUrl ?? ""),
      logoImageUrl: String(scribe.logoImageUrl ?? ""),
      showInDiscover: prefs.showInDiscover !== false,
      notifySubscribersEnabled: prefs.notifySubscribersEnabled !== false,
      umami,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleConnectUmami(
  did: string,
  siteSlug: string,
  formData: FormData,
) {
  const baseUrl = ((formData.get("umamiBaseUrl") as string) ?? "").trim();
  const websiteId = ((formData.get("umamiWebsiteId") as string) ?? "").trim();
  const username = ((formData.get("umamiUsername") as string) ?? "").trim();
  const passwordInput = ((formData.get("umamiPassword") as string) ?? "").trim();

  if (!baseUrl || !websiteId || !username) {
    return {
      ok: false,
      error: "Base URL, Website ID, and Username are required.",
    };
  }

  // Blank password on Edit means "keep the existing password" — only the
  // initial connect requires it, since nothing is stored yet at that point.
  let password = passwordInput;
  if (!password) {
    const existing = getUmamiConfig(did, siteSlug);
    if (!existing) {
      return { ok: false, error: "Password is required." };
    }
    password = existing.password;
  }

  const result = await testUmamiConnection(baseUrl, websiteId, username, password);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  saveUmamiConfig(did, siteSlug, {
    baseUrl,
    websiteId,
    websiteName: result.websiteName,
    username,
    password,
  });

  logger.info(
    { event: "site.umami_connect", user_did: did, rkey: siteSlug },
    "site.umami_connect",
  );

  return {
    ok: true,
    error: undefined,
    umamiConnected: true as const,
    umamiWebsiteName: result.websiteName,
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, params }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const { siteSlug } = params;
  const formData = await request.formData();
  const intent = (formData.get("_intent") as string) ?? "saveSite";

  if (intent === "connectUmami") {
    return handleConnectUmami(did, siteSlug, formData);
  }

  if (intent === "disconnectUmami") {
    deleteUmamiConfig(did, siteSlug);
    logger.info(
      { event: "site.umami_disconnect", user_did: did, rkey: siteSlug },
      "site.umami_disconnect",
    );
    return { ok: true, error: undefined, umamiDisconnected: true as const };
  }

  if (intent === "resyncImageFolder") {
    if (!useRealOAuth) return { ok: true, imageFolderSynced: true as const };
    try {
      const agent = await getAtpAgent(did, request);
      const site = await getSite(agent, did, siteSlug);
      const scribe = (site.value.scribe as Record<string, unknown>) ?? {};
      const contributors = (scribe.contributors as SiteContributor[]) ?? [];
      const acceptedDids = contributors
        .filter((c) => c.status === "accepted")
        .map((c) => c.did);
      const siteUri = `at://${did}/${SITE_COLLECTION}/${siteSlug}`;
      const siteDomain = String(scribe.domain ?? "");

      await syncSiteRoster(
        siteUri,
        siteDomain,
        acceptedDids,
        request.headers.get("Cookie") ?? "",
      );
      logger.info(
        { event: "site.image_folder_resync", user_did: did, rkey: siteSlug },
        "site.image_folder_resync",
      );
      return { ok: true, imageFolderSynced: true as const };
    } catch (err) {
      rethrowIfRedirect(err);
      return { ok: false, error: `Resync failed: ${String(err)}` };
    }
  }

  const title = (formData.get("title") as string)?.trim();
  const url = (formData.get("url") as string)?.trim().toLowerCase();
  const urlPrefix = ((formData.get("urlPrefix") as string) ?? "")
    .trim()
    .toLowerCase();
  const description = ((formData.get("description") as string) ?? "").trim();
  const splashImageUrl = (
    (formData.get("splashImageUrl") as string) ?? ""
  ).trim();
  const logoImageUrl = ((formData.get("logoImageUrl") as string) ?? "").trim();
  const showInDiscover = formData.get("showInDiscover") === "on";
  const notifySubscribersEnabled =
    formData.get("notifySubscribersEnabled") !== null;

  if (!title) return { ok: false, error: "Title is required." };
  if (!url) return { ok: false, error: "Domain is required." };
  if (!DOMAIN_RE.test(url))
    return {
      ok: false,
      error: "Domain must be a valid hostname (e.g. myblog.com).",
    };
  if (splashImageUrl && !IMAGE_URL_RE.test(splashImageUrl))
    return { ok: false, error: "Splash Image URL must start with https://." };
  if (logoImageUrl && !IMAGE_URL_RE.test(logoImageUrl))
    return { ok: false, error: "Logo Image URL must start with https://." };

  let iconUploadFailed = false;
  let canonicalFailures = 0;

  if (useRealOAuth) {
    try {
      const agent = await getAtpAgent(did, request);

      // Fetch existing record to preserve fields we don't manage here
      // (articles, groups, contributors, createdAt, etc.)
      const existing = await getSite(agent, did, siteSlug);
      const existingValue = existing.value;
      const {
        description: _scribeDescription,
        logoImageBlob: existingLogoBlob,
        ...existingScribeBase
      } = (existingValue.scribe as Record<string, unknown>) ?? {};

      // Resolve icon blob ref — only re-upload when the logo URL changes or no cached blob exists
      let iconBlobRef: unknown;
      if (logoImageUrl) {
        const existingLogoUrl = String(existingScribeBase.logoImageUrl ?? "");
        if (existingLogoUrl !== logoImageUrl || !existingLogoBlob) {
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
                event: "site.configure.icon_blob_error",
                error: String(blobErr),
              },
              "icon blob upload error — save will proceed without icon",
            );
            iconUploadFailed = true;
          }
        } else {
          iconBlobRef = existingLogoBlob;
        }
      }

      // Bug fix: previously saved with no swapRecord at all — a real
      // concurrent-edit race window. Now passes the CID fetched above.
      await putSite(
        agent,
        did,
        siteSlug,
        {
          ...existingValue,
          url: `https://${url}`,
          name: title,
          ...(iconBlobRef !== undefined
            ? { icon: iconBlobRef }
            : { icon: undefined }),
          preferences: { showInDiscover, notifySubscribersEnabled },
          scribe: {
            ...(({ $type: _, ...rest }) => rest)(
              existingScribeBase as Record<string, unknown>,
            ),
            domain: url,
            basePath: urlPrefix,
            title,
            // Bug fix: this was previously written to the record's top level
            // instead of nested in scribe (while existingScribeBase above
            // always strips the old scribe.description), silently deleting
            // the description from every site on its first Configure save —
            // sites.tsx's createSite writes it here, and its loader only
            // ever reads it back from scribe.description.
            ...(description ? { description } : { description: undefined }),
            ...(splashImageUrl
              ? { splashImageUrl }
              : { splashImageUrl: undefined }),
            ...(logoImageUrl ? { logoImageUrl } : { logoImageUrl: undefined }),
            ...(iconBlobRef !== undefined
              ? { logoImageBlob: iconBlobRef }
              : { logoImageBlob: undefined }),
            updatedAt: new Date().toISOString(),
          },
        },
        existing.cid,
      );

      const domainChanged = String(existingScribeBase.domain ?? "") !== url;
      const basePathChanged =
        String(existingScribeBase.basePath ?? "") !== urlPrefix;

      if (domainChanged) {
        await registerSocialOrigin(url, did);
      }

      if (domainChanged || basePathChanged) {
        // Bug fix: previously a raw listRecords with limit:100 and no cursor,
        // silently missing documents beyond the first page. listDocuments
        // paginates internally.
        const documentRecords = await listDocuments(agent, did);
        // Bug fix (ADR 0013): `site` is either a loose reader URL or the
        // document's owning publication's at:// URI — never a bare
        // `https://{domain}` string. The old filter compared against that
        // https shape, which no document's `site` field can ever equal, so
        // this canonical-URL rewrite silently matched nothing. It also used
        // to overwrite `site` with the same wrong https shape, which would
        // have corrupted the loose/published signal had the filter ever
        // matched. The rkey (and therefore the at:// URI) never changes when
        // only the domain/basePath change, so `site` itself is left alone —
        // only the derived canonicalUrl is recomputed.
        const siteAtUri = `at://${did}/${SITE_COLLECTION}/${siteSlug}`;
        const newSiteHttpsUrl = `https://${url}`;
        const docUpdates = documentRecords
          .filter((record) => record.value.site === siteAtUri)
          .map((record) => {
            const val = record.value;
            const docPath = String(val.path ?? "");
            const newCanonicalUrl = urlPrefix
              ? `${newSiteHttpsUrl}/${urlPrefix}${docPath}`
              : `${newSiteHttpsUrl}${docPath}`;
            const existingDocScribe =
              (val.scribe as Record<string, unknown>) ?? {};
            return putDocument(
              agent,
              did,
              record.rkey,
              {
                ...val,
                scribe: { ...existingDocScribe, canonicalUrl: newCanonicalUrl },
                updatedAt: new Date().toISOString(),
              },
              record.cid,
            );
          });
        const canonicalResults = await Promise.allSettled(docUpdates);
        canonicalFailures = canonicalResults.filter(
          (r) => r.status === "rejected",
        ).length;
        if (canonicalFailures > 0) {
          logger.warn(
            {
              event: "site.configure.canonical_update_error",
              user_did: did,
              rkey: siteSlug,
              failed: canonicalFailures,
            },
            "canonical URL updates partially failed",
          );
        }
      }
    } catch (err) {
      rethrowIfRedirect(err);
      return { ok: false, error: `Failed to save: ${String(err)}` };
    }
  }

  logger.info(
    { event: "site.configure", user_did: did, rkey: siteSlug },
    "site.configure",
  );
  return {
    ok: true,
    ...(iconUploadFailed
      ? {
          iconWarning:
            "Icon could not be uploaded — it will be retried on next save.",
        }
      : {}),
    ...(canonicalFailures > 0
      ? {
          canonicalWarning: `${canonicalFailures} article canonical URL(s) could not be updated — try saving again.`,
        }
      : {}),
  };
}

type ResyncImageFolderActionData =
  | { ok: true; imageFolderSynced: true }
  | { ok: false; error: string };

type ConnectUmamiActionData =
  | { ok: true; umamiConnected: true; umamiWebsiteName: string }
  | { ok: false; error: string };

type DisconnectUmamiActionData =
  | { ok: true; umamiDisconnected: true }
  | { ok: false; error: string };

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.site?.title ?? "Configure Site";
  return [{ title: `Configure — ${title}` }];
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConfigureSite({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { site } = loaderData;
  const navigate = useNavigate();
  const { addToast } = useToast();

  const initialValues = useMemo(
    () => ({
      title: site.title,
      url: site.url,
      urlPrefix: site.urlPrefix,
      description: site.description,
      splashImageUrl: site.splashImageUrl,
      logoImageUrl: site.logoImageUrl,
      showInDiscover: site.showInDiscover,
      notifySubscribersEnabled: site.notifySubscribersEnabled,
    }),
    [],
  );

  const [formValues, setFormValues] = useState(initialValues);

  const isDirty = useMemo(
    () => JSON.stringify(formValues) !== JSON.stringify(initialValues),
    [formValues],
  );

  // Only block navigations that leave this page — not form submissions to the
  // same route. Suppressed once save succeeds so navigate() passes through.
  const shouldBlock: BlockerFunction = ({ currentLocation, nextLocation }) =>
    isDirty &&
    !actionData?.ok &&
    currentLocation.pathname !== nextLocation.pathname;
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!actionData?.ok) return;
    addToast({
      heading: "Site configured",
      content: formValues.title,
      variant: "success",
    });
    if ("iconWarning" in actionData && actionData.iconWarning) {
      addToast({
        heading: "Icon not uploaded",
        content: actionData.iconWarning,
        variant: "primary",
        autoExpire: false,
      });
    }
    if ("canonicalWarning" in actionData && actionData.canonicalWarning) {
      addToast({
        heading: "Canonical URLs incomplete",
        content: actionData.canonicalWarning,
        variant: "danger",
        autoExpire: false,
      });
    }
    navigate("/sites");
  }, [actionData]);

  function handleChange(field: keyof typeof formValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFormValues((prev) => ({ ...prev, [field]: e.target.value }));
  }

  // ── Umami analytics ──────────────────────────────────────────────────────

  const umamiModal = useModal();
  const umamiDisconnectModal = useModal();
  const umamiFetcher = useFetcher<ConnectUmamiActionData>();
  const umamiDisconnectFetcher = useFetcher<DisconnectUmamiActionData>();
  const isConnectingUmami = umamiFetcher.state !== "idle";
  const isDisconnectingUmami = umamiDisconnectFetcher.state !== "idle";

  const [umamiFormValues, setUmamiFormValues] = useState({
    baseUrl: "",
    websiteId: "",
    username: "",
    password: "",
  });

  function openConnectUmamiModal() {
    setUmamiFormValues({ baseUrl: "", websiteId: "", username: "", password: "" });
    umamiModal.open();
  }

  function openEditUmamiModal() {
    setUmamiFormValues({
      baseUrl: site.umami.configured ? site.umami.baseUrl : "",
      websiteId: site.umami.configured ? site.umami.websiteId : "",
      username: site.umami.configured ? site.umami.username : "",
      password: "",
    });
    umamiModal.open();
  }

  useEffect(() => {
    if (!umamiFetcher.data?.ok) return;
    addToast({
      heading: "Umami connected",
      content: `Now tracking ${umamiFetcher.data.umamiWebsiteName}`,
      variant: "success",
    });
    umamiModal.close();
  }, [umamiFetcher.data]);

  useEffect(() => {
    if (!umamiDisconnectFetcher.data?.ok) return;
    addToast({ heading: "Umami disconnected", variant: "primary" });
    umamiDisconnectModal.close();
  }, [umamiDisconnectFetcher.data]);

  // ── Image Library site folder resync (ADR 0020) ─────────────────────────
  const resyncImageFolderFetcher = useFetcher<ResyncImageFolderActionData>();
  const isResyncingImageFolder = resyncImageFolderFetcher.state !== "idle";

  useEffect(() => {
    if (!resyncImageFolderFetcher.data) return;
    if (resyncImageFolderFetcher.data.ok) {
      addToast({ heading: "Image folder synced", variant: "success" });
    } else {
      addToast({
        heading: "Resync failed",
        content: resyncImageFolderFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [resyncImageFolderFetcher.data]);

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Gear}>
          Configure
        </PageContainerHeading>
      }
    >
      <PageSection>
        <h5>{site.title}</h5>
        <Form id="configure-site-form" method="post" className={styles.form}>
          <input type="hidden" name="_intent" value="saveSite" />
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Identity</legend>
            <Input
              id="title"
              name="title"
              label="Title"
              value={formValues.title}
              onChange={handleChange("title")}
              required
            />
            <div className={styles.row}>
              <Input
                id="url"
                name="url"
                label="Domain"
                value={formValues.url}
                onChange={handleChange("url")}
                placeholder="myblog.com"
                required
              />
              <Input
                id="urlPrefix"
                name="urlPrefix"
                label="URL Prefix"
                value={formValues.urlPrefix}
                onChange={handleChange("urlPrefix")}
                placeholder="blog"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                className={styles.textarea}
                value={formValues.description}
                onChange={handleChange("description")}
                placeholder="What this site is about…"
                rows={3}
              />
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Images</legend>
            <ImagePicker
              name="splashImageUrl"
              label="Splash Image"
              defaultValue={site.splashImageUrl}
              onChange={(url) =>
                setFormValues((prev) => ({ ...prev, splashImageUrl: url }))
              }
            />
            <ImagePicker
              name="logoImageUrl"
              label="Logo Image"
              defaultValue={site.logoImageUrl}
              onChange={(url) =>
                setFormValues((prev) => ({ ...prev, logoImageUrl: url }))
              }
              variant="square"
            />
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Discovery</legend>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                fontSize: "1.4rem",
              }}
            >
              <input
                type="checkbox"
                name="showInDiscover"
                checked={formValues.showInDiscover}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    showInDiscover: e.target.checked,
                  }))
                }
              />
              Show in Discover
            </label>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Notifications</legend>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                fontSize: "1.4rem",
              }}
            >
              <input
                type="checkbox"
                name="notifySubscribersEnabled"
                value="on"
                checked={formValues.notifySubscribersEnabled}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    notifySubscribersEnabled: e.target.checked,
                  }))
                }
              />
              Show &ldquo;Notify subscribers?&rdquo; prompt after publishing
            </label>
            <p
              style={{
                margin: "0.4rem 0 0",
                fontSize: "1.2rem",
                color: "var(--text-secondary)",
              }}
            >
              Uncheck to silence the notification prompt if you prefer to notify
              manually.
            </p>
          </fieldset>

          {actionData?.error && (
            <p className={styles.errorMessage}>{actionData.error}</p>
          )}
        </Form>
      </PageSection>

      <PageSection>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Analytics</legend>
          {site.umami.configured ? (
            <div className={styles.umamiConnected}>
              <p>
                Connected to Umami — tracking{" "}
                <a
                  href={`${site.umami.baseUrl.replace(/\/$/, "")}/websites/${site.umami.websiteId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {site.umami.websiteName}
                </a>
              </p>
              <div className={styles.umamiActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openEditUmamiModal}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={umamiDisconnectModal.open}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" onClick={openConnectUmamiModal}>
              Integrate with Umami
            </Button>
          )}
        </fieldset>
      </PageSection>

      <PageSection>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Image Library</legend>
          <p style={{ margin: "0 0 0.8rem", color: "var(--text-secondary)" }}>
            This site has a shared Image Library folder, visible only to you
            and your accepted Contributors. It's kept in sync automatically
            whenever a Contributor is invited, removed, or accepts an
            invitation — use this if you think it's out of sync (e.g. after
            a temporary Image Service outage).
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={isResyncingImageFolder}
            onClick={() => {
              const formData = new FormData();
              formData.set("_intent", "resyncImageFolder");
              resyncImageFolderFetcher.submit(formData, { method: "post" });
            }}
          >
            {isResyncingImageFolder ? "Syncing…" : "Resync Image Folder"}
          </Button>
        </fieldset>
      </PageSection>

      <FooterPortal>
        <Link to="/sites">
          <Button type="button" variant="secondary" tabIndex={-1}>
            Cancel
          </Button>
        </Link>
        <Button
          form="configure-site-form"
          type="submit"
          variant="success"
          disabled={!isDirty}
        >
          Save Changes
        </Button>
      </FooterPortal>

      <Modal
        isOpen={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Unsaved changes"
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Stay
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard & Leave
            </Button>
          </>
        }
      >
        <p>
          You have unsaved changes that will be lost if you leave this page.
        </p>
      </Modal>

      <Modal
        isOpen={umamiModal.isOpen}
        onClose={umamiModal.close}
        title={site.umami.configured ? "Edit Umami Integration" : "Integrate with Umami"}
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={umamiModal.close}
              disabled={isConnectingUmami}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="umami-connect-form"
              disabled={isConnectingUmami}
            >
              {isConnectingUmami ? "Connecting…" : "Connect"}
            </Button>
          </div>
        }
      >
        <umamiFetcher.Form id="umami-connect-form" method="post">
          <input type="hidden" name="_intent" value="connectUmami" />
          <Input
            id="umamiBaseUrl"
            name="umamiBaseUrl"
            label="Umami Base URL"
            value={umamiFormValues.baseUrl}
            onChange={(e) =>
              setUmamiFormValues((prev) => ({
                ...prev,
                baseUrl: e.target.value,
              }))
            }
            placeholder="https://analytics.example.com"
            required
          />
          <Input
            id="umamiWebsiteId"
            name="umamiWebsiteId"
            label="Umami Website ID"
            value={umamiFormValues.websiteId}
            onChange={(e) =>
              setUmamiFormValues((prev) => ({
                ...prev,
                websiteId: e.target.value,
              }))
            }
            required
          />
          <Input
            id="umamiUsername"
            name="umamiUsername"
            label="Umami Username"
            value={umamiFormValues.username}
            onChange={(e) =>
              setUmamiFormValues((prev) => ({
                ...prev,
                username: e.target.value,
              }))
            }
            required
          />
          <Input
            id="umamiPassword"
            name="umamiPassword"
            type="password"
            label="Umami Password"
            value={umamiFormValues.password}
            onChange={(e) =>
              setUmamiFormValues((prev) => ({
                ...prev,
                password: e.target.value,
              }))
            }
            placeholder={
              site.umami.configured
                ? "•••••••• (leave blank to keep existing password)"
                : undefined
            }
            required={!site.umami.configured}
          />
          <p className={styles.umamiHint}>
            Self-hosted Umami has no scoped API key — this uses your Umami
            login directly. We recommend creating a dedicated Umami user
            restricted to just this website, rather than using your main
            admin login, in case this credential is ever compromised.
          </p>
          {umamiFetcher.data && !umamiFetcher.data.ok && (
            <p className={styles.errorMessage}>{umamiFetcher.data.error}</p>
          )}
        </umamiFetcher.Form>
      </Modal>

      <Modal
        isOpen={umamiDisconnectModal.isOpen}
        onClose={umamiDisconnectModal.close}
        title="Disconnect Umami"
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={umamiDisconnectModal.close}
              disabled={isDisconnectingUmami}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="umami-disconnect-form"
              variant="danger"
              disabled={isDisconnectingUmami}
            >
              {isDisconnectingUmami ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        }
      >
        <umamiDisconnectFetcher.Form id="umami-disconnect-form" method="post">
          <input type="hidden" name="_intent" value="disconnectUmami" />
          <p>Disconnect this site from Umami?</p>
          <p className={styles.deleteWarning}>
            The Pageviews chart will disappear from Insights for this site.
            Reconnecting later requires re-entering your Umami password — it
            isn&rsquo;t stored anywhere it can be retrieved from.
          </p>
          {umamiDisconnectFetcher.data && !umamiDisconnectFetcher.data.ok && (
            <p className={styles.errorMessage}>
              {umamiDisconnectFetcher.data.error}
            </p>
          )}
        </umamiDisconnectFetcher.Form>
      </Modal>
    </PageContainer>
  );
}

// ── Form import (React Router's Form component) ───────────────────────────────

import { Form, Link } from "react-router";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { ImagePicker } from "~/components/ImagePicker/ImagePicker";
