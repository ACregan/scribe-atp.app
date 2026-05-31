import { Input } from "~/components/Input/Input";
import { Select } from "~/components/Select/Select";
import { RichTextEditor } from "~/components/RichTextEditor/RichTextEditor";
import { PageSection } from "~/components/PageContainer/PageContainer";

export type SiteOption = { rkey: string; title: string; url: string };

type ArticleFormProps = {
  defaultTitle?: string;
  defaultUrl?: string;
  defaultSplashImageUrl?: string;
  defaultContent?: string;
  sites: SiteOption[];
  selectedSites: string[];
  onSitesChange: (rkeys: string[]) => void;
  error?: string;
};

export function ArticleForm({
  defaultTitle,
  defaultUrl,
  defaultSplashImageUrl,
  defaultContent,
  sites,
  selectedSites,
  onSitesChange,
  error,
}: ArticleFormProps) {
  const siteOptions = sites.map((s) => ({
    value: s.rkey,
    label: `${s.title} (${s.url})`,
  }));

  return (
    <>
      <PageSection>
        <Input
          name="title"
          label="Title"
          defaultValue={defaultTitle}
        />
        <Input
          name="url"
          label="URL slug"
          placeholder="my-article-title"
          defaultValue={defaultUrl}
        />
        <Input
          name="splashImageUrl"
          label="Splash image URL"
          defaultValue={defaultSplashImageUrl}
        />
      </PageSection>

      {siteOptions.length > 0 && (
        <PageSection>
          <Select
            name="sites"
            label="Assign to sites"
            options={siteOptions}
            multiple
            value={selectedSites}
            onChange={onSitesChange}
          />
        </PageSection>
      )}

      <PageSection>
        <RichTextEditor
          name="content"
          label="Content"
          defaultValue={defaultContent}
        />
      </PageSection>

      {error && (
        <PageSection>
          <p style={{ color: "var(--red)" }}>{error}</p>
        </PageSection>
      )}
    </>
  );
}
