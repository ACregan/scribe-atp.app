import { redirect } from "react-router";
import { PageContainer, PageSection } from "~/components/PageContainer/PageContainer";
import { Input } from "~/components/Input/Input";
import { Button } from "~/components/Button/Button";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import type { Route } from "./+types/configure";
import styles from "./configure.module.css";

const SITE_COLLECTION = "app.scribe.site";
const DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-._]*\.[a-zA-Z]{2,}$/;

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, params }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);
  const { siteSlug } = params;

  if (!useRealOAuth) {
    return {
      site: {
        rkey: siteSlug,
        title: "NoRobots.blog",
        url: "norobots.blog",
        urlPrefix: "blog",
        description: "A personal blog about technology, the open web, and avoiding robots.",
        splashImageUrl: "",
        logoImageUrl: "",
      },
    };
  }

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
  const urlPrefix = ((formData.get("urlPrefix") as string) ?? "").trim().toLowerCase();
  const description = ((formData.get("description") as string) ?? "").trim();
  const splashImageUrl = ((formData.get("splashImageUrl") as string) ?? "").trim();
  const logoImageUrl = ((formData.get("logoImageUrl") as string) ?? "").trim();

  if (!title) return { ok: false, error: "Title is required." };
  if (!url) return { ok: false, error: "Domain is required." };
  if (!DOMAIN_RE.test(url))
    return { ok: false, error: "Domain must be a valid hostname (e.g. myblog.com)." };

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
          ...(splashImageUrl ? { splashImageUrl } : { splashImageUrl: undefined }),
          ...(logoImageUrl ? { logoImageUrl } : { logoImageUrl: undefined }),
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      return { ok: false, error: `Failed to save: ${String(err)}` };
    }
  }

  throw redirect("/sites");
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

  return (
    <PageContainer title={`Configure — ${site.title}`}>
      <PageSection>
        <Form method="post" className={styles.form}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Identity</legend>
            <Input
              name="title"
              label="Title"
              defaultValue={site.title}
              required
            />
            <div className={styles.row}>
              <Input
                name="url"
                label="Domain"
                defaultValue={site.url}
                placeholder="myblog.com"
                required
              />
              <Input
                name="urlPrefix"
                label="URL Prefix"
                defaultValue={site.urlPrefix}
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
                defaultValue={site.description}
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
              defaultValue={site.splashImageUrl}
              placeholder="https://…"
            />
            {site.splashImageUrl && (
              <img
                className={styles.preview}
                src={site.splashImageUrl}
                alt="Splash preview"
              />
            )}
            <Input
              name="logoImageUrl"
              label="Logo Image URL"
              defaultValue={site.logoImageUrl}
              placeholder="https://…"
            />
            {site.logoImageUrl && (
              <img
                className={styles.logoPreview}
                src={site.logoImageUrl}
                alt="Logo preview"
              />
            )}
          </fieldset>

          {actionData?.error && (
            <p className={styles.errorMessage}>{actionData.error}</p>
          )}

          <div className={styles.actions}>
            <a href="/sites" className={styles.cancelLink}>
              Cancel
            </a>
            <Button type="submit">Save Changes</Button>
          </div>
        </Form>
      </PageSection>
    </PageContainer>
  );
}

// ── Form import (React Router's Form component) ───────────────────────────────

import { Form } from "react-router";
