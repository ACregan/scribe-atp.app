import { useEffect, useRef, useState } from "react";
import cn from "classnames";
import { Button } from "~/components/Button/Button";
import { Spinner } from "~/components/Spinner/Spinner";
import { useToast } from "~/components/Toast/ToastContext";
import { useSiteChat, type SiteChatResolveErrorType } from "./useSiteChat";
import styles from "./SiteChatPanel.module.css";

const RESOLVE_ERROR_COPY: Record<SiteChatResolveErrorType, string> = {
  notCreatedYet: "Chat will start once your first Contributor accepts their invite.",
  unknown: "Chat isn't available right now.",
};

type Props = {
  siteSlug: string;
  currentUserDid: string;
  ownerDid: string;
};

export function SiteChatPanel({ siteSlug, currentUserDid, ownerDid }: Props) {
  const { convoId, resolveErrorType, messages, profiles, sendError, isSending, sendMessage } =
    useSiteChat(siteSlug, ownerDid);
  const { addToast } = useToast();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  // ADR 0025 Decision 6 — same toast convention as everywhere else in this
  // file (danger, non-expiring); the typed message stays in the input so
  // retrying is just hitting Send again.
  useEffect(() => {
    if (!sendError) return;
    addToast({
      heading: "Message failed to send",
      content: sendError,
      variant: "danger",
      autoExpire: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendError]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function handleSend() {
    if (!text.trim()) return;
    sendMessage(text.trim());
    setText("");
  }

  return (
    <div className={styles.panel}>
      <h6 className={styles.heading}>Site Chat</h6>

      {resolveErrorType ? (
        <p className={styles.resolveError}>{RESOLVE_ERROR_COPY[resolveErrorType]}</p>
      ) : !convoId ? (
        <div className={styles.loading}>
          <Spinner size="small" />
        </div>
      ) : (
        <>
          <ul className={styles.messageList} ref={listRef}>
            {messages.map((message) => {
              const isOwn = message.senderDid === currentUserDid;
              const profile = profiles.get(message.senderDid);
              return (
                <li
                  key={message.id}
                  className={cn(styles.messageRow, isOwn && styles.messageRowOwn)}
                >
                  <div className={cn(styles.messageBubble, isOwn && styles.messageBubbleOwn)}>
                    {!isOwn && (
                      <span className={styles.messageSender}>
                        {profile?.displayName || profile?.handle || message.senderDid}
                      </span>
                    )}
                    <p className={styles.messageText}>{message.text}</p>
                    <span className={styles.messageTime}>
                      {new Date(message.sentAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className={styles.composer}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message…"
              className={styles.composerInput}
              disabled={isSending}
            />
            <Button
              type="button"
              variant="primary"
              disabled={isSending || !text.trim()}
              onClick={handleSend}
            >
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
