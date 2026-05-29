import type { Route } from "./+types/home";
import {
  getAtpAgent,
  getAuthSession,
  useRealOAuth,
} from "~/services/auth.server";
import { useModal } from "~/components/Modal/useModal";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import { useFetcher } from "react-router";
import styles from "./home.module.css";
import { useToast } from "~/components/Toast/ToastContext";

const IS_DEV = process.env.NODE_ENV !== "production";

const SCRIBE_COLLECTIONS = ["app.scribe.article", "app.scribe.site"];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Scribe ATP" },
    {
      name: "description",
      content: "Scribe ATP is a ATproto driven content management system.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { handle, isAuthenticated } = await getAuthSession(request);
  return {
    userName: handle ?? null,
    isAuthenticated,
    isDev: IS_DEV,
  };
}

export async function action({ request }: Route.ActionArgs) {
  if (!IS_DEV) return { error: "Not available." };

  const { did } = await getAuthSession(request);
  if (!did) return { error: "Not authenticated." };

  if (!useRealOAuth) {
    return { ok: true, deleted: 0, devMode: true };
  }

  try {
    const agent = await getAtpAgent(did);
    let deleted = 0;

    for (const collection of SCRIBE_COLLECTIONS) {
      let cursor: string | undefined;
      do {
        const result = await agent.com.atproto.repo.listRecords({
          repo: did,
          collection,
          limit: 100,
          cursor,
        });
        await Promise.all(
          result.data.records.map((record) =>
            agent.com.atproto.repo.deleteRecord({
              repo: did,
              collection,
              rkey: record.uri.split("/").pop()!,
            }),
          ),
        );
        deleted += result.data.records.length;
        cursor = result.data.cursor;
      } while (cursor);
    }

    return { ok: true, deleted, devMode: false };
  } catch (err) {
    return { error: `Nuke failed: ${String(err)}` };
  }
}

export function HydrateFallback() {
  return <div>Loading...</div>;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { userName, isAuthenticated, isDev } = loaderData;
  const nukeModal = useModal();
  const fetcher = useFetcher<{
    ok?: boolean;
    deleted?: number;
    devMode?: boolean;
    error?: string;
  }>();

  const isPending = fetcher.state !== "idle";
  const result = fetcher.data;

  const handleConfirm = () => {
    nukeModal.close();
    fetcher.submit({}, { method: "post" });
  };

  const { addToast } = useToast();

  return (
    <>
      <h1>Home Page</h1>
      <p>
        {userName} is {isAuthenticated == false && "NOT"} Authenticated
      </p>

      <button
        onClick={() =>
          addToast({
            heading: "Hello!",
            content: "This is a test toast.",
            variant: "primary",
            expireTimeSeconds: 10,
          })
        }
      >
        ADD REGULAR TOAST
      </button>

      <button
        onClick={() =>
          addToast({
            heading: "Hello Again!",
            content: "This is another test toast.",
            variant: "secondary",
            autoExpire: false,
          })
        }
      >
        ADD ANOTHER TOAST
      </button>

      <button
        onClick={() =>
          addToast({
            heading: "WARNING!",
            content: "HOT TOAST!",
            variant: "danger",
            autoExpire: false,
          })
        }
      >
        ADD DANGER TOAST
      </button>

      {isDev && (
        <div className={styles.devTools}>
          <h2 className={styles.devToolsTitle}>Dev Tools</h2>
          <Button
            variant="danger"
            onClick={nukeModal.open}
            disabled={isPending}
          >
            {isPending ? "Nuking…" : "Nuke PDS Data"}
          </Button>
          {result?.ok && (
            <p className={styles.nukeSuccess}>
              {result.devMode
                ? "Dev mode — no real data deleted."
                : `Done. ${result.deleted} record${result.deleted !== 1 ? "s" : ""} deleted.`}
            </p>
          )}
          {result?.error && <p className={styles.nukeError}>{result.error}</p>}
        </div>
      )}

      <Modal
        isOpen={nukeModal.isOpen}
        onClose={nukeModal.close}
        title="Nuke PDS Data"
        footer={
          <div className={styles.modalFooter}>
            <Button variant="secondary" onClick={nukeModal.close}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirm}>
              Delete Everything
            </Button>
          </div>
        }
      >
        <p>
          This will permanently delete <strong>all</strong> Scribe records from
          your PDS:
        </p>
        <ul className={styles.nukeList}>
          {SCRIBE_COLLECTIONS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p>This cannot be undone.</p>
      </Modal>
    </>
  );
}
