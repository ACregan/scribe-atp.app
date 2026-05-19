import type { Route } from "./+types/list";
import { Form, Link, redirect, useFetcher } from "react-router";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { useState } from "react";
import { ArticleList, ArticleItem } from "~/components/ArticleItem/ArticleItem";
import styles from "./list.module.css";
import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";

const ARTICLE_COLLECTION = "app.scribe.article";
const GROUP_COLLECTION = "app.scribe.group";

type Article = {
  uri: string;
  cid: string;
  title: string;
  url: string;
  splashImageUrl: string;
  createdAt: string;
};

type Group = {
  uri: string;
  cid: string;
  title: string;
  slug: string;
};

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP – Articles" }];
}

export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("_intent") as string;

  if (intent === "createGroup") {
    const title = (formData.get("title") as string)?.trim();
    if (!title) return { error: "Group title is required." };

    const slug = toSlug(title);
    if (!slug)
      return { error: "Title must contain at least one letter or number." };

    if (useRealOAuth) {
      const agent = await getAtpAgent(did);
      await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: GROUP_COLLECTION,
        rkey: slug,
        record: {
          $type: GROUP_COLLECTION,
          title,
          children: [],
          createdAt: new Date().toISOString(),
        },
      });
    }

    return redirect("/article/list");
  }

  // intent === "deleteArticle"
  const rkey = formData.get("rkey") as string;
  const cid = formData.get("cid") as string | null;
  if (!rkey) return redirect("/article/list");

  if (useRealOAuth) {
    const agent = await getAtpAgent(did);
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey,
      swapRecord: cid ?? undefined,
    });
  }

  return redirect("/article/list");
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return {
      devMode: true,
      groups: [
        {
          uri: "at://did:dev:user/app.scribe.group/engineering",
          cid: "dev-cid-g1",
          title: "Engineering",
          slug: "engineering",
        },
        {
          uri: "at://did:dev:user/app.scribe.group/design",
          cid: "dev-cid-g2",
          title: "Design",
          slug: "design",
        },
      ] as Group[],
      articles: [
        {
          uri: "at://did:dev:user/app.scribe.article/hello-world",
          cid: "dev-cid-1",
          title: "Hello World",
          url: "hello-world",
          splashImageUrl: "",
          createdAt: new Date("2025-01-01").toISOString(),
        },
        {
          uri: "at://did:dev:user/app.scribe.article/getting-started",
          cid: "dev-cid-2",
          title: "Getting Started with AT Protocol",
          url: "getting-started",
          splashImageUrl: "",
          createdAt: new Date("2025-02-14").toISOString(),
        },
        {
          uri: "at://did:dev:user/app.scribe.article/lexical-editor",
          cid: "dev-cid-3",
          title: "Building a Rich Text Editor with Lexical",
          url: "lexical-editor",
          splashImageUrl: "",
          createdAt: new Date("2025-03-20").toISOString(),
        },
        {
          uri: "at://did:dev:user/app.scribe.article/sqlite-sessions",
          cid: "dev-cid-4",
          title: "Persisting OAuth Sessions with SQLite",
          url: "sqlite-sessions",
          splashImageUrl: "",
          createdAt: new Date("2025-04-05").toISOString(),
        },
      ] as Article[],
    };
  }

  try {
    const agent = await getAtpAgent(did);
    const [articlesResult, groupsResult] = await Promise.all([
      agent.com.atproto.repo.listRecords({
        repo: did,
        collection: ARTICLE_COLLECTION,
        limit: 100,
      }),
      agent.com.atproto.repo.listRecords({
        repo: did,
        collection: GROUP_COLLECTION,
        limit: 100,
      }),
    ]);

    const articles: Article[] = articlesResult.data.records.map((record) => ({
      uri: record.uri,
      cid: record.cid,
      title: String(record.value.title ?? "(untitled)"),
      url: String(record.value.url ?? record.uri.split("/").pop() ?? ""),
      splashImageUrl: String(record.value.splashImageUrl ?? ""),
      createdAt: String(record.value.createdAt ?? ""),
    }));

    const groups: Group[] = groupsResult.data.records.map((record) => ({
      uri: record.uri,
      cid: record.cid,
      title: String(record.value.title ?? "(untitled)"),
      slug: record.uri.split("/").pop() ?? "",
    }));

    return { articles, groups, devMode: false };
  } catch (err) {
    console.error("Failed to fetch records from PDS:", err);
    return {
      articles: [] as Article[],
      groups: [] as Group[],
      devMode: false,
      error: String(err),
    };
  }
}

function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [title, setTitle] = useState("");

  const isPending = fetcher.state !== "idle";
  const serverError = fetcher.data?.error;

  // Close when the fetcher completes without an error
  if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) {
    onClose();
  }

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="_intent" value="createGroup" />
      <Input
        id="group-title"
        name="title"
        label="Group title"
        placeholder="e.g. Engineering"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={serverError}
        autoFocus
      />
      <Button type="submit" disabled={isPending || !title.trim()}>
        {isPending ? "Creating…" : "Proceed"}
      </Button>
    </fetcher.Form>
  );
}

export default function ListView({ loaderData }: Route.ComponentProps) {
  const { articles, groups, devMode, error } = loaderData;
  const { isOpen, open, close } = useModal();

  return (
    <PageContainer
      title="Articles & Groups"
      topButtons={
        <>
          <Link to="/article/create">
            <Button type="button" variant="primary">
              Draft New Article
            </Button>
          </Link>
          <Button type="button" variant="primary" onClick={open}>
            Add New Group
          </Button>
        </>
      }
    >
      {error && <p style={{ color: "red" }}>Error loading articles: {error}</p>}

      {groups.length > 0 && (
        <PageSection>
          <h4>Groups</h4>
          <ul>
            {groups.map((group) => (
              <li key={group.uri}>
                <strong>{group.title}</strong>
                <small style={{ fontFamily: "monospace", marginLeft: "1rem" }}>
                  {group.uri}
                </small>
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      {articles.length === 0 && !devMode && !error && (
        <PageSection>
          <p>
            No articles yet. <Link to="/article/create">Create one.</Link>
          </p>
        </PageSection>
      )}

      {articles.length > 0 && (
        <PageSection>
          <h4>Articles</h4>
          <ArticleList>
            {articles.map((article) => (
              <ArticleItem
                key={article.cid}
                uri={article.uri}
                title={article.title}
                createdAt={article.createdAt}
                cid={article.cid}
              />
            ))}
          </ArticleList>
        </PageSection>
      )}

      {devMode && (
        <PageSection>
          <p style={{ color: "orange" }}>Dev mode: no real PDS connected.</p>
        </PageSection>
      )}

      <Modal
        isOpen={isOpen}
        onClose={close}
        title="Add new group"
        footer={null}
      >
        <CreateGroupModal onClose={close} />
      </Modal>
    </PageContainer>
  );
}
