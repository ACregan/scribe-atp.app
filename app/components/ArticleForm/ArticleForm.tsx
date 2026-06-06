import { Input } from "~/components/Input/Input";
import { Textarea } from "~/components/Textarea/Textarea";
import { Select } from "~/components/Select/Select";
import { RichTextEditor } from "~/components/RichTextEditor/RichTextEditor";
import {
  PageSection,
  PageSectionColumns,
  PageSectionColumn,
} from "~/components/PageContainer/PageContainer";

import { type SiteOption } from "~/components/types";
export type { SiteOption };

type ArticleFormProps = {
  defaultTitle?: string;
  defaultUrl?: string;
  defaultSplashImageUrl?: string;
  defaultSynopsis?: string;
  defaultContent?: string;
  sites: SiteOption[];
  selectedSites: string[];
  onSitesChange: (rkeys: string[]) => void;
  error?: string;
  columnar?: boolean;
};

export function ArticleForm({
  defaultTitle,
  defaultUrl,
  defaultSplashImageUrl,
  defaultSynopsis,
  defaultContent,
  sites,
  selectedSites,
  onSitesChange,
  error,
  columnar = false,
}: ArticleFormProps) {
  const siteOptions = sites.map((s) => ({
    value: s.rkey,
    label: `${s.title} (${s.url})`,
  }));

  if (columnar) {
    return (
      <PageSection fill>
        <PageSectionColumns breakpoint="lg">
          <PageSectionColumn span={4} overflow>
            <Input name="title" label="Title" defaultValue={defaultTitle} />
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
            <Textarea
              id="synopsis"
              name="synopsis"
              label="Synopsis"
              rows={3}
              placeholder="Brief description of the article..."
              defaultValue={defaultSynopsis}
            />
            {siteOptions.length > 0 && (
              <Select
                name="sites"
                label="Assign to sites"
                options={siteOptions}
                multiple
                value={selectedSites}
                onChange={onSitesChange}
              />
            )}
            {error && <p style={{ color: "var(--red)" }}>{error}</p>}
          </PageSectionColumn>
          <PageSectionColumn span={8} overflow>
            <RichTextEditor
              name="content"
              label="Content"
              defaultValue={defaultContent}
            />
          </PageSectionColumn>
        </PageSectionColumns>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection>
        <Input name="title" label="Title" defaultValue={defaultTitle} />
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
        <Textarea
          id="synopsis"
          name="synopsis"
          label="Synopsis"
          rows={3}
          placeholder="Brief description of the article..."
          defaultValue={defaultSynopsis}
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
