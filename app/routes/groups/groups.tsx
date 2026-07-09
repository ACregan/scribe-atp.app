import type { Route } from "./+types/groups";
import { Link, useFetcher, useNavigate, useLocation } from "react-router";
import { useState, useRef, useEffect } from "react";
import { requireAuth, getAtpAgent, useRealOAuth } from "~/services/auth.server";
import { devGroupsLoader } from "~/services/devFixtures.server";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Select } from "~/components/Select/Select";
import { Spinner } from "~/components/Spinner/Spinner";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { SITE_COLLECTION, SLUG_RE } from "~/constants";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { IconBadge } from "~/components/IconBadge/IconBadge";
import { Pill } from "~/components/Pill/Pill";
import { useToast } from "~/components/Toast/ToastContext";
import { toSlug } from "~/hooks/utils";
import styles from "./groups.module.css";

type GroupSummary = {
  slug: string;
  title: string;
  articleCount: number;
};

type SiteWithGroups = {
  rkey: string;
  title: string;
  url: string;
  urlPrefix: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
  groups: GroupSummary[];
};

type GroupSiteItemProps = {
  site: SiteWithGroups;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Groups & Articles" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) return devGroupsLoader();

  const agent = await getAtpAgent(did);
  const result = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SITE_COLLECTION,
    limit: 100,
  });

  const sites: SiteWithGroups[] = result.data.records
    .filter((record) => (record.value as Record<string, unknown>).scribe != null)
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      const scribe = value.scribe as Record<string, unknown>;
      const groups =
        (
          scribe.groups as
            | Array<{ slug: string; title: string; articles?: unknown[] }>
            | undefined
        )?.map(({ slug, title, articles }) => ({
          slug,
          title,
          articleCount: articles?.length ?? 0,
        })) ?? [];

      return {
        rkey: record.uri.split("/").pop()!,
        title: String(scribe.title ?? ""),
        url: String(scribe.domain ?? ""),
        urlPrefix: String(scribe.basePath ?? ""),
        splashImageUrl: scribe.splashImageUrl
          ? String(scribe.splashImageUrl)
          : undefined,
        logoImageUrl: scribe.logoImageUrl ? String(scribe.logoImageUrl) : undefined,
        groups,
      };
    });

  return { sites };
}

export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("_intent") as string;

  if (intent === "createGroup") {
    const siteRkey = (formData.get("siteRkey") as string)?.trim();
    const title = (formData.get("title") as string)?.trim();
    if (!siteRkey) return { error: "Please select a site." };
    if (!title) return { error: "Group title is required." };
    const slugInput = (formData.get("slug") as string)?.trim().toLowerCase();
    const slug = slugInput || toSlug(title);
    if (!slug)
      return { error: "Title must contain at least one letter or number." };
    if (!SLUG_RE.test(slug))
      return {
        error: "URL path must be lowercase letters, numbers and hyphens only.",
      };

    if (useRealOAuth) {
      const agent = await getAtpAgent(did);
      const rec = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
      });
      const val = rec.data.value as Record<string, unknown>;
      const scribe = val.scribe as Record<string, unknown> & {
        groups?: Array<{ slug: string }>;
      };
      if ((scribe.groups ?? []).some((g) => g.slug === slug)) {
        return {
          error: "A group with this URL path already exists on this site.",
        };
      }
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
        record: {
          ...val,
          scribe: {
            ...scribe,
            groups: [...(scribe.groups ?? []), { slug, title, articles: [] }],
            updatedAt: new Date().toISOString(),
          },
        },
        swapRecord: rec.data.cid,
      });
    }

    return { ok: true };
  }

  return { error: "Unknown intent." };
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

function CreateGroupModal({
  sites,
  onClose,
}: {
  sites: SiteWithGroups[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const [selectedSiteRkey, setSelectedSiteRkey] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const slugDirtyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { addToast } = useToast();

  const selectedSite = sites.find((s) => s.rkey === selectedSiteRkey);
  const isPending = fetcher.state !== "idle";
  const slugValid = slug === "" || SLUG_RE.test(slug);
  const composedPath = [selectedSite?.url, selectedSite?.urlPrefix, slug]
    .filter(Boolean)
    .join("/");

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      addToast({
        heading: "Group created",
        content: title,
        variant: "success",
      });
      onCloseRef.current();
    }
  }, [fetcher.state, fetcher.data]);

  const siteOptions = sites.map((s) => ({ value: s.rkey, label: s.title }));

  return (
    <fetcher.Form
      method="post"
      style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}
    >
      <input type="hidden" name="_intent" value="createGroup" />
      <Select
        name="siteRkey"
        label="Site"
        options={siteOptions}
        value={selectedSiteRkey}
        onChange={(value) => setSelectedSiteRkey(value)}
      />
      <Input
        id="group-title"
        name="title"
        label="Group title"
        placeholder="e.g. Engineering"
        value={title}
        onChange={(e) => {
          const val = e.target.value;
          setTitle(val);
          if (!slugDirtyRef.current) setSlug(toSlug(val));
        }}
        autoFocus
      />
      <Input
        id="group-slug"
        name="slug"
        label="URL path"
        placeholder="e.g. engineering"
        value={slug}
        onChange={(e) => {
          slugDirtyRef.current = true;
          setSlug(e.target.value.toLowerCase());
        }}
        error={
          !slugValid
            ? "Lowercase letters, numbers and hyphens only."
            : undefined
        }
      />
      {slug && slugValid && (
        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--text-secondary)",
            margin: 0,
          }}
        >
          Path: <code>{composedPath}</code>
        </p>
      )}
      {fetcher.data?.error && (
        <p
          style={{
            fontSize: "1.3rem",
            color: "var(--action-danger)",
            margin: 0,
          }}
        >
          {fetcher.data.error}
        </p>
      )}
      <p
        style={{
          fontSize: "1.2rem",
          color: "var(--text-secondary)",
          margin: 0,
        }}
      >
        The URL path cannot be changed after the group is created.
      </p>
      <Button
        type="submit"
        disabled={
          isPending || !selectedSiteRkey || !title.trim() || !slug || !slugValid
        }
      >
        {isPending ? "Creating…" : "Create Group"}
      </Button>
    </fetcher.Form>
  );
}

const GroupSiteItem: React.FC<GroupSiteItemProps> = ({ site }) => {
  return (
    <li className={styles.siteItem}>
      <div className={styles.siteHeader}>
        <div
          className={styles.splashContainer}
          style={
            site.splashImageUrl
              ? { backgroundImage: `url(${site.splashImageUrl})` }
              : undefined
          }
        >
          <div
            className={styles.logoContainer}
            style={
              site.logoImageUrl
                ? { backgroundImage: `url(${site.logoImageUrl})` }
                : undefined
            }
          />
        </div>
        <IconBadge
          icon={SvgImageList.Website}
          size="medium"
          className={styles.iconBadgeSite}
        />
        <strong className={styles.siteTitle}>{site.title}</strong>
        <div className={styles.siteActions}>
          <Link to={`/article/list/${site.rkey}`}>
            <Button type="button" variant="primary" tabIndex={-1}>
              Manage
            </Button>
          </Link>
        </div>
      </div>
      {site.groups.length > 0 && (
        <ul className={styles.groupList}>
          {site.groups.map((group) => (
            <li key={group.slug} className={styles.groupItem}>
              <IconBadge icon={SvgImageList.Folder} />
              <span className={styles.folderName}>{group.title}</span>
              <Pill>
                {group.articleCount}{" "}
                {group.articleCount === 1 ? "ARTICLE" : "ARTICLES"}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export default function GroupsIndex({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;
  const { isOpen, open, close } = useModal();

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isNewRoute = pathname.endsWith("/new");

  const openedByRouteRef = useRef(false);
  useEffect(() => {
    if (isNewRoute && !openedByRouteRef.current) {
      openedByRouteRef.current = true;
      // No site to add a group to — redirect instead of opening a modal
      // that has nothing to target (mirrors the topButtons guard below).
      if (sites.length === 0) {
        navigate("/groups", { replace: true });
      } else {
        open();
      }
    }
    if (!isNewRoute) {
      openedByRouteRef.current = false;
    }
  }, [isNewRoute]);

  function handleCloseModal() {
    close();
    if (isNewRoute) navigate("/groups", { replace: true });
  }

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Folder}>
          Groups
        </PageContainerHeading>
      }
      topButtons={
        sites.length > 0 ? (
          <Button type="button" variant="primary" onClick={open}>
            Add New Group
          </Button>
        ) : undefined
      }
    >
      <PageSection>
        {sites.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No sites yet. Create a site first to manage groups.</p>
          </div>
        ) : (
          <ul className={styles.siteList}>
            {sites.map((site) => (
              <GroupSiteItem key={site.rkey} site={site} />
            ))}
          </ul>
        )}
      </PageSection>

      <Modal
        isOpen={isOpen}
        onClose={handleCloseModal}
        title="Add new group"
        footer={null}
      >
        {isOpen && (
          <CreateGroupModal sites={sites} onClose={handleCloseModal} />
        )}
      </Modal>
    </PageContainer>
  );
}
