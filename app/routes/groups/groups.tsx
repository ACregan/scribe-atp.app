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
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import styles from "./groups.module.css";

type SiteGroup = {
  slug: string;
  title: string;
};

type SiteWithGroups = {
  rkey: string;
  title: string;
  groups: SiteGroup[];
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
            { slug: "engineering", title: "Engineering" },
            { slug: "getting-started", title: "Getting Started" },
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
    const groups = (
      value.groups as Array<{ slug: string; title: string }> | undefined
    )?.map(({ slug, title }) => ({ slug, title })) ?? [];

    return {
      rkey: record.uri.split("/").pop()!,
      title: String(value.title ?? ""),
      groups,
    };
  });

  return { sites };
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export default function GroupsIndex({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Folder}>
          Groups & Articles
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
              <li key={site.rkey} className={styles.siteItem}>
                <div className={styles.siteHeader}>
                  <strong className={styles.siteTitle}>{site.title}</strong>
                  <Link to={`/article/list/${site.rkey}`}>
                    <Button type="button" variant="primary">
                      Manage
                    </Button>
                  </Link>
                </div>
                {site.groups.length > 0 && (
                  <ul className={styles.groupList}>
                    {site.groups.map((group) => (
                      <li key={group.slug} className={styles.groupItem}>
                        {group.title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </PageContainer>
  );
}
