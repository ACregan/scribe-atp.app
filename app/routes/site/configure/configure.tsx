import { useNavigate, useBlocker, type BlockerFunction } from "react-router";
import { useEffect, useState, useMemo } from "react";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { Input } from "~/components/Input/Input";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { devConfigureLoader } from "~/services/devFixtures.server";
import type { Route } from "./+types/configure";
import styles from "./configure.module.css";
import { useToast } from "~/components/Toast/ToastContext";

import { SITE_COLLECTION, DOCUMENT_COLLECTION, DOMAIN_RE, IMAGE_URL_RE } from "~/constants";
import { logger } from "~/services/logger.server";

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, params }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);
  const { siteSlug } = params;

  if (!useRealOAuth) return devConfigureLoader(siteSlug);

  const agent = await getAtpAgent(did);
  const record = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: SITE_COLLECTION,
    rkey: siteSlug,
  });

  const v = record.data.value as Record<string, unknown>;
  const scribe = (v.scribe as Record<string, unknown>) ?? {};
  const prefs = (v.preferences as Record<string, unknown>) ?? {};
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
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Replace any Scribe image variant in a URL with the thumb (300px) variant.
// Non-Scribe URLs are returned unchanged.
function resolveLogoThumbUrl(logoImageUrl: string): string {
  return logoImageUrl.replace(/\/(600|1200|1800|max)\.webp$/, "/thumb.webp");
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, params }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const { siteSlug } = params;
  const formData = await request.formData();

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
  const notifySubscribersEnabled = formData.get("notifySubscribersEnabled") !== null;

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
      const agent = await getAtpAgent(did);

      // Fetch existing record to preserve fields we don't manage here
      // (articles, groups, contributors, createdAt, etc.)
      const existing = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
      });
      const existingValue = existing.data.value as Record<string, unknown>;
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
            const thumbSrc = resolveLogoThumbUrl(logoImageUrl);
            let imgRes = await fetch(thumbSrc);
            if (!imgRes.ok && thumbSrc !== logoImageUrl) {
              imgRes = await fetch(logoImageUrl);
            }
            if (imgRes.ok) {
              const imgBuffer = await imgRes.arrayBuffer();
              const mimeType = imgRes.headers.get("content-type") ?? "image/webp";
              const uploadRes = await agent.uploadBlob(new Uint8Array(imgBuffer), {
                encoding: mimeType,
              });
              iconBlobRef = uploadRes.data.blob;
            } else {
              iconUploadFailed = true;
            }
          } catch (blobErr) {
            logger.warn(
              { event: "site.configure.icon_blob_error", error: String(blobErr) },
              "icon blob upload error — save will proceed without icon",
            );
            iconUploadFailed = true;
          }
        } else {
          iconBlobRef = existingLogoBlob;
        }
      }

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
        record: {
          ...existingValue,
          url: `https://${url}`,
          name: title,
          ...(description ? { description } : { description: undefined }),
          ...(iconBlobRef !== undefined ? { icon: iconBlobRef } : { icon: undefined }),
          preferences: { showInDiscover, notifySubscribersEnabled },
          scribe: {
            ...(({ $type: _, ...rest }) => rest)(existingScribeBase as Record<string, unknown>),
            domain: url,
            basePath: urlPrefix,
            title,
            ...(splashImageUrl ? { splashImageUrl } : { splashImageUrl: undefined }),
            ...(logoImageUrl ? { logoImageUrl } : { logoImageUrl: undefined }),
            ...(iconBlobRef !== undefined ? { logoImageBlob: iconBlobRef } : { logoImageBlob: undefined }),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      const domainChanged = String(existingScribeBase.domain ?? "") !== url;
      const basePathChanged = String(existingScribeBase.basePath ?? "") !== urlPrefix;

      if (domainChanged || basePathChanged) {
        const docsResult = await agent.com.atproto.repo.listRecords({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          limit: 100,
        });
        const oldSiteHttpsUrl = `https://${String(existingScribeBase.domain ?? "")}`;
        const newSiteHttpsUrl = `https://${url}`;
        const docUpdates = docsResult.data.records
          .filter((record) => (record.value as Record<string, unknown>).site === oldSiteHttpsUrl)
          .map((record) => {
            const val = record.value as Record<string, unknown>;
            const docPath = String(val.path ?? "");
            const newCanonicalUrl = urlPrefix
              ? `${newSiteHttpsUrl}/${urlPrefix}${docPath}`
              : `${newSiteHttpsUrl}${docPath}`;
            const existingDocScribe = (val.scribe as Record<string, unknown>) ?? {};
            const drkey = record.uri.split("/").pop()!;
            return agent.com.atproto.repo.putRecord({
              repo: did,
              collection: DOCUMENT_COLLECTION,
              rkey: drkey,
              record: {
                ...val,
                site: newSiteHttpsUrl,
                scribe: { ...existingDocScribe, canonicalUrl: newCanonicalUrl },
                updatedAt: new Date().toISOString(),
              },
              swapRecord: record.cid,
            });
          });
        const canonicalResults = await Promise.allSettled(docUpdates);
        canonicalFailures = canonicalResults.filter((r) => r.status === "rejected").length;
        if (canonicalFailures > 0) {
          logger.warn(
            { event: "site.configure.canonical_update_error", user_did: did, rkey: siteSlug, failed: canonicalFailures },
            "canonical URL updates partially failed",
          );
        }
      }
    } catch (err) {
      return { ok: false, error: `Failed to save: ${String(err)}` };
    }
  }

  logger.info(
    { event: "site.configure", user_did: did, rkey: siteSlug },
    "site.configure",
  );
  return {
    ok: true,
    ...(iconUploadFailed ? { iconWarning: "Icon could not be uploaded — it will be retried on next save." } : {}),
    ...(canonicalFailures > 0 ? { canonicalWarning: `${canonicalFailures} article canonical URL(s) could not be updated — try saving again.` } : {}),
  };
}

export function meta({ data }: Route.MetaArgs) {
  const title = data?.site?.title ?? "Configure Site";
  return [{ title: `Configure — ${title}` }];
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
            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.4rem" }}>
              <input
                type="checkbox"
                name="showInDiscover"
                checked={formValues.showInDiscover}
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, showInDiscover: e.target.checked }))
                }
              />
              Show in Discover
            </label>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Notifications</legend>
            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.4rem" }}>
              <input
                type="checkbox"
                name="notifySubscribersEnabled"
                value="on"
                checked={formValues.notifySubscribersEnabled}
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, notifySubscribersEnabled: e.target.checked }))
                }
              />
              Show &ldquo;Notify subscribers?&rdquo; prompt after publishing
            </label>
            <p style={{ margin: "0.4rem 0 0", fontSize: "1.2rem", color: "var(--text-secondary)" }}>
              Uncheck to silence the notification prompt if you prefer to notify manually.
            </p>
          </fieldset>

          {actionData?.error && (
            <p className={styles.errorMessage}>{actionData.error}</p>
          )}
        </Form>
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
    </PageContainer>
  );
}

// ── Form import (React Router's Form component) ───────────────────────────────

import { Form, Link } from "react-router";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { ImagePicker } from "~/components/ImagePicker/ImagePicker";
