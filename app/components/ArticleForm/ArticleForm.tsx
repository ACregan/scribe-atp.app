import { useState } from "react";
import { Input } from "~/components/Input/Input";
import { Textarea } from "~/components/Textarea/Textarea";
import { RichTextEditor } from "~/components/RichTextEditor/RichTextEditor";
import TextArrayInput from "~/components/TextArrayInput/TextArrayInput";
import { ImagePicker } from "~/components/ImagePicker/ImagePicker";
import {
  PageSection,
  PageSectionColumns,
  PageSectionColumn,
} from "~/components/PageContainer/PageContainer";

import { type SiteOption } from "~/components/types";
export type { SiteOption };
import styles from "./ArticleForm.module.css";

type ArticleFormProps = {
  defaultTitle?: string;
  defaultUrl?: string;
  defaultSplashImageUrl?: string;
  defaultDescription?: string;
  defaultTags?: string[];
  defaultContent?: string;
  // When provided the title/url inputs become controlled — used by the create
  // route to drive slug auto-fill. Edit leaves these undefined (uncontrolled).
  titleValue?: string;
  urlValue?: string;
  onTitleChange?: (value: string) => void;
  onUrlChange?: (value: string) => void;
  onTagsChange?: (tags: string[]) => void;
  onSplashImageUrlChange?: (url: string) => void;
  onContentChange?: (html: string) => void;
  error?: string;
  urlWarning?: string;
  columnar?: boolean;
};

export function ArticleForm({
  defaultTitle,
  defaultUrl,
  defaultSplashImageUrl,
  defaultDescription,
  defaultTags,
  defaultContent,
  titleValue,
  urlValue,
  onTitleChange,
  onUrlChange,
  onTagsChange,
  onSplashImageUrlChange,
  onContentChange,
  error,
  urlWarning,
  columnar = false,
}: ArticleFormProps) {
  const [tags, setTags] = useState<string[]>(defaultTags ?? []);

  function handleSetTags(value: string[] | ((prev: string[]) => string[])) {
    setTags((prev) => {
      const newTags = typeof value === "function" ? value(prev) : value;
      onTagsChange?.(newTags);
      return newTags;
    });
  }

  const tagsInput = (
    <>
      {tags.map((tag) => (
        <input key={tag} type="hidden" name="tags" value={tag} />
      ))}
      <TextArrayInput
        id="tags"
        label="Tags"
        placeholder="Add a tag..."
        textArrayItems={tags}
        setTextArrayItems={handleSetTags}
      />
    </>
  );

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
            <Input
              id="title"
              name="title"
              label="Title"
              required
              {...titleProps}
            />
            <Input
              id="url"
              name="url"
              label="URL slug"
              placeholder="my-article-title"
              required
              {...urlProps}
            />
            {urlWarning && (
              <p
                className={styles.urlWarning}
              >
                {urlWarning}
              </p>
            )}
            <ImagePicker
              name="splashImageUrl"
              label="Splash image"
              defaultValue={defaultSplashImageUrl}
              onChange={onSplashImageUrlChange}
            />
            <Textarea
              id="description"
              name="description"
              label="Description"
              rows={3}
              placeholder="Brief description of the article..."
              defaultValue={defaultDescription}
            />
            {tagsInput}
            {error && <p className={styles.error}>{error}</p>}
          </PageSectionColumn>
          <PageSectionColumn span={8} overflow>
            <RichTextEditor
              name="content"
              label="Content"
              required
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
        <Input id="title" name="title" label="Title" required {...titleProps} />
        <Input
          id="url"
          name="url"
          label="URL slug"
          placeholder="my-article-title"
          required
          {...urlProps}
        />
        {urlWarning && (
          <p className={styles.urlWarning}>
            {urlWarning}
          </p>
        )}
        <ImagePicker
          name="splashImageUrl"
          label="Splash image"
          defaultValue={defaultSplashImageUrl}
          onChange={onSplashImageUrlChange}
        />
        <Textarea
          id="description"
          name="description"
          label="Description"
          rows={3}
          placeholder="Brief description of the article..."
          defaultValue={defaultDescription}
        />
        {tagsInput}
      </PageSection>

      <PageSection>
        <RichTextEditor
          name="content"
          label="Content"
          required
          defaultValue={defaultContent}
        />
      </PageSection>

      {error && (
        <PageSection>
          <p className={styles.error}>{error}</p>
        </PageSection>
      )}
    </>
  );
}
