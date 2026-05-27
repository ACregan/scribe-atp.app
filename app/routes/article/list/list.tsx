import type { Route } from "./+types/list";
import { Link } from "react-router";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import styles from "../../sites/sites.module.css";

const SITE_COLLECTION = "app.scribe.site";

type SiteRef = {
  rkey: string;
  title: string;
  url: string;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Article Lists" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return {
      sites: [
        { rkey: "norobots-blog", title: "NoRobots.blog", url: "norobots.blog" },
        { rkey: "perpetualsummer-ltd", title: "Perpetual Summer LTD", url: "perpetualsummer.ltd" },
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
      title: String(value.title ?? ""),
      url: String(value.url ?? ""),
    };
  });

  return { sites };
}

export default function ArticleListIndex({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;

  return (
    <PageContainer title="Article Lists">
      <PageSection>
        {sites.length === 0 ? (
          <p className={styles.emptyState}>
            No sites yet.{" "}
            <Link to="/sites">Add a site</Link> to get started.
          </p>
        ) : (
          <ul className={styles.siteList}>
            {sites.map((site) => (
              <li key={site.rkey} className={styles.siteItem}>
                <div className={styles.siteInfo}>
                  <strong className={styles.siteTitle}>{site.title}</strong>
                  <span className={styles.siteUrl}>{site.url}</span>
                </div>
                <div className={styles.siteActions}>
                  <Link to={`/article/list/${site.rkey}`}>
                    <Button type="button">Manage Articles</Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </PageContainer>
  );
}
