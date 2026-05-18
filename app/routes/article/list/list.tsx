import type { Route } from "./+types/list";
import { Form, Link, redirect, useFetcher } from "react-router";
import {
  getAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { useState } from "react";

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
    if (!slug) return { error: "Title must contain at least one letter or number." };

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
    return { articles: [] as Article[], groups: [] as Group[], devMode: true };
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
    return { articles: [] as Article[], groups: [] as Group[], devMode: false, error: String(err) };
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

export default function ArticleList({ loaderData }: Route.ComponentProps) {
  const { articles, groups, devMode, error } = loaderData;
  const { isOpen, open, close } = useModal();

  return (
    <div>
      <h1>Articles</h1>
      <Link to="/article/create">New article</Link>
      {" · "}
      <Button type="button" variant="secondary" onClick={open}>
        Add new group
      </Button>

      {devMode && (
        <p style={{ color: "orange" }}>
          Dev mode: no real PDS connected. Save an article in production to see
          it here.
        </p>
      )}

      {error && <p style={{ color: "red" }}>Error loading articles: {error}</p>}

      {groups.length > 0 && (
        <>
          <h2>Groups</h2>
          <ul>
            {groups.map((group) => (
              <li key={group.uri}>
                <strong>{group.title}</strong>
                <small style={{ fontFamily: "monospace", marginLeft: "1rem" }}>{group.uri}</small>
              </li>
            ))}
          </ul>
        </>
      )}

      {articles.length === 0 && !devMode && !error && (
        <p>
          No articles yet. <Link to="/article/create">Create one.</Link>
        </p>
      )}

      <ul>
        {articles.map((article) => (
          <li key={article.uri}>
            <strong>{article.title}</strong>
            {article.createdAt && (
              <> — {new Date(article.createdAt).toLocaleDateString()}</>
            )}
            <br />
            <small style={{ fontFamily: "monospace" }}>{article.uri}</small>
            <Link to={`/article/view/${article.uri.split("/").pop()}`}>View</Link>
            {" · "}
            <Link to={`/article/edit/${article.uri.split("/").pop()}`}>Edit</Link>
            {" · "}
            <Form
              method="post"
              style={{ display: "inline" }}
              onSubmit={(e) => {
                if (!confirm(`Delete "${article.title}"?`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="_intent" value="deleteArticle" />
              <input type="hidden" name="rkey" value={article.uri.split("/").pop()} />
              <input type="hidden" name="cid" value={article.cid} />
              <Button type="submit" variant="danger">Delete</Button>
            </Form>
          </li>
        ))}
      </ul>

      <Modal
        isOpen={isOpen}
        onClose={close}
        title="Add new group"
        footer={null}
      >
        <CreateGroupModal onClose={close} />
      </Modal>
    </div>
  );
}
