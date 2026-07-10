import { Link } from "react-router";
import { Button } from "~/components/Button/Button";
import { IconBadge } from "~/components/IconBadge/IconBadge";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import styles from "./SiteWelcome.module.css";

interface SiteWelcomeProps {
  userName: string | null;
}

export function SiteWelcome({ userName }: SiteWelcomeProps) {
  return (
    <div className={styles.welcome}>
      <IconBadge icon={SvgImageList.ScribeCMSLogo} size="large" />

      <p className={styles.greeting}>
        Hello
        {userName && (
          <>
            {" "}
            <strong>{userName}</strong>
          </>
        )}
        ,
      </p>
      <h2 className={styles.heading}>Welcome to Scribe CMS.</h2>

      <p>
        You&apos;re now part of the ATProto blogging and content community.
        Every article you write here is fully site.standard compliant —
        ready to share on Bluesky, and discoverable through aggregation and
        reader apps built for the open network, like Scribe Reader,
        Standard-Reader.app, and Con.Vey.Dev.
      </p>

      <p>
        Want your articles on your own website too? The Scribe SDK gives
        first-class support for Next.js, Nuxt, React, Vue, Angular, and React
        Router — pull your Scribe content straight into any of them, so your
        writing lives on your own site and stays discoverable across the
        wider network.
      </p>

      <div className={styles.actions}>
        <Link to="/article/create">
          <Button type="button" icon={SvgImageList.Document} tabIndex={-1}>
            Write your first article
          </Button>
        </Link>
      </div>

      <p className={styles.secondaryText}>
        Prefer to get organised first?{" "}
        <Link to="/sites/new">Configure your Site</Link>, then use Groups to
        sort articles into topics or categories.
      </p>
    </div>
  );
}

export default SiteWelcome;
