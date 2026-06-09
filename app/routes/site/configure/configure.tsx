import {
  useNavigate,
  useBlocker,
  type unstable_BlockerFunction as BlockerFunction,
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
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { devConfigureLoader } from "~/services/devFixtures.server";
import type { Route } from "./+types/configure";
import styles from "./configure.module.css";
import { useToast } from "~/components/Toast/ToastContext";

import { SITE_COLLECTION, DOMAIN_RE } from "~/constants";

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
  return {
    site: {
      rkey: siteSlug,
      title: String(v.title ?? ""),
      url: String(v.url ?? ""),
      urlPrefix: String(v.urlPrefix ?? ""),
      description: String(v.description ?? ""),
      splashImageUrl: String(v.splashImageUrl ?? ""),
      logoImageUrl: String(v.logoImageUrl ?? ""),
    },
  };
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

  if (!title) return { ok: false, error: "Title is required." };
  if (!url) return { ok: false, error: "Domain is required." };
  if (!DOMAIN_RE.test(url))
    return {
      ok: false,
      error: "Domain must be a valid hostname (e.g. myblog.com).",
    };

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

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
        record: {
          ...existingValue,
          $type: SITE_COLLECTION,
          title,
          url,
          urlPrefix,
          // Store optional fields only when non-empty; clear by omitting
          ...(description ? { description } : { description: undefined }),
          ...(splashImageUrl
            ? { splashImageUrl }
            : { splashImageUrl: undefined }),
          ...(logoImageUrl ? { logoImageUrl } : { logoImageUrl: undefined }),
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      return { ok: false, error: `Failed to save: ${String(err)}` };
    }
  }

  return { ok: true };
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
      variant: "primary",
    });
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
            <Input
              name="splashImageUrl"
              label="Splash Image URL"
              value={formValues.splashImageUrl}
              onChange={handleChange("splashImageUrl")}
              placeholder="https://…"
            />
            {formValues.splashImageUrl && (
              <img
                className={styles.preview}
                src={formValues.splashImageUrl}
                alt="Splash preview"
              />
            )}
            <Input
              name="logoImageUrl"
              label="Logo Image URL"
              value={formValues.logoImageUrl}
              onChange={handleChange("logoImageUrl")}
              placeholder="https://…"
            />
            {formValues.logoImageUrl && (
              <img
                className={styles.logoPreview}
                src={formValues.logoImageUrl}
                alt="Logo preview"
              />
            )}
          </fieldset>

          {actionData?.error && (
            <p className={styles.errorMessage}>{actionData.error}</p>
          )}
        </Form>
      </PageSection>
      <FooterPortal>
        <Link to="/sites">
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        <Button form="configure-site-form" type="submit" disabled={!isDirty}>
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
