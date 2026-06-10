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
  // When provided the title/url inputs become controlled — used by the create
  // route to drive slug auto-fill. Edit leaves these undefined (uncontrolled).
  titleValue?: string;
  urlValue?: string;
  onTitleChange?: (value: string) => void;
  onUrlChange?: (value: string) => void;
  sites: SiteOption[];
  selectedSites: string[];
  onSitesChange: (rkeys: string[]) => void;
  onContentChange?: (html: string) => void;
  error?: string;
  columnar?: boolean;
};

export function ArticleForm({
  defaultTitle,
  defaultUrl,
  defaultSplashImageUrl,
  defaultSynopsis,
  defaultContent,
  titleValue,
  urlValue,
  onTitleChange,
  onUrlChange,
  sites,
  selectedSites,
  onSitesChange,
  onContentChange,
  error,
  columnar = false,
}: ArticleFormProps) {
  const siteOptions = sites.map((s) => ({
    value: s.rkey,
    label: `${s.title} (${s.url})`,
  }));

  const titleProps: React.InputHTMLAttributes<HTMLInputElement> =
    titleValue !== undefined
      ? { value: titleValue, onChange: (e) => onTitleChange?.(e.target.value) }
      : { defaultValue: defaultTitle };

  const urlProps: React.InputHTMLAttributes<HTMLInputElement> =
    urlValue !== undefined
      ? { value: urlValue, onChange: (e) => onUrlChange?.(e.target.value) }
      : { defaultValue: defaultUrl };

  if (columnar) {
    return (
      <PageSection fill>
        <PageSectionColumns breakpoint="lg">
          <PageSectionColumn span={4} overflow>
            <Input id="title" name="title" label="Title" {...titleProps} />
            <Input
              id="url"
              name="url"
              label="URL slug"
              placeholder="my-article-title"
              {...urlProps}
            />
            <Input
              id="splashImageUrl"
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
            {error && <p style={{ color: "var(--action-danger)" }}>{error}</p>}
          </PageSectionColumn>
          <PageSectionColumn span={8} overflow>
            <RichTextEditor
              name="content"
              label="Content"
              defaultValue={defaultContent}
              onChange={onContentChange}
            />
          </PageSectionColumn>
        </PageSectionColumns>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection>
        <Input id="title" name="title" label="Title" {...titleProps} />
        <Input
          id="url"
          name="url"
          label="URL slug"
          placeholder="my-article-title"
          {...urlProps}
        />
        <Input
          id="splashImageUrl"
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
          <p style={{ color: "var(--action-danger)" }}>{error}</p>
        </PageSection>
      )}
    </>
  );
}
