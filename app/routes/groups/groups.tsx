import type { Route } from "./+types/groups";
import { Link } from "react-router";
import { requireAuth, getAtpAgent, useRealOAuth } from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Spinner } from "~/components/Spinner/Spinner";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { SITE_COLLECTION } from "~/constants";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { Pill } from "~/components/Pill/Pill";
import styles from "./groups.module.css";

type SiteGroup = {
  slug: string;
  title: string;
  articleCount: number;
};

type SiteWithGroups = {
  rkey: string;
  title: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
  groups: SiteGroup[];
};

type GroupSiteItemProps = {
  site: SiteWithGroups;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Groups & Articles" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return {
      sites: [
        {
          rkey: "norobots-blog",
          title: "NoRobots.blog",
          groups: [
            { slug: "engineering", title: "Engineering", articleCount: 4 },
            {
              slug: "getting-started",
              title: "Getting Started",
              articleCount: 2,
            },
          ],
        },
        {
          rkey: "perpetualsummer-ltd",
          title: "Perpetual Summer LTD",
          groups: [],
        },
      ] as SiteWithGroups[],
    };
  }

  const agent = await getAtpAgent(did);
  const result = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SITE_COLLECTION,
    limit: 100,
  });

  const sites: SiteWithGroups[] = result.data.records.map((record) => {
    const value = record.value as Record<string, unknown>;
    const groups =
      (
        value.groups as
          | Array<{ slug: string; title: string; articles?: unknown[] }>
          | undefined
      )?.map(({ slug, title, articles }) => ({
        slug,
        title,
        articleCount: articles?.length ?? 0,
      })) ?? [];

    return {
      rkey: record.uri.split("/").pop()!,
      title: String(value.title ?? ""),
      splashImageUrl: value.splashImageUrl
        ? String(value.splashImageUrl)
        : undefined,
      logoImageUrl: value.logoImageUrl ? String(value.logoImageUrl) : undefined,
      groups,
    };
  });

  return { sites };
}

export function HydrateFallback() {
  return <Spinner size="large" />;
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
        <strong className={styles.siteTitle}>{site.title}</strong>
        <div className={styles.siteActions}>
          <Link to={`/article/list/${site.rkey}`}>
            <Button type="button" variant="primary">
              Manage
            </Button>
          </Link>
        </div>
      </div>
      {site.groups.length > 0 && (
        <ul className={styles.groupList}>
          {site.groups.map((group) => (
            <li key={group.slug} className={styles.groupItem}>
              <div className={styles.groupIconContainer}>
                <SvgIcon name={SvgImageList.Folder} fill="var(--white)" />
              </div>
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

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Folder}>
          Groups
        </PageContainerHeading>
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
    </PageContainer>
  );
}
