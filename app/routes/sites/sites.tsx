import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import type { Route } from "./+types/sites";
import { Select } from "~/components/Select/Select";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { Button } from "~/components/Button/Button";
import { useState } from "react";
import styles from "./sites.module.css";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Scribe ATP" },
    {
      name: "description",
      content: "Scribe ATP is a ATproto driven content management system.",
    },
  ];
}

export function HydrateFallback() {
  return <div>Loading...</div>;
}

export async function loader({ request }: Route.LoaderArgs) {
  const mockSiteData = [
    {
      url: "norobots.blog",
      title: "NoRobots.blog",
      urlPrefix: "blog",
      ownerId: "did:ofTheOwner",
      contributors: ["did:ofContributorOne", "did:ofContributorTwo"],
      groups: [
        {
          slug: "creative-writing",
          type: "group",
          title: "Creative Writing",
          children: [
            {
              slug: "llms-are-full-of-shit",
              type: "article",
            },
          ],
        },
        {
          slug: "blogging",
          type: "group",
          title: "Blog",
          children: [
            {
              slug: "the-crows-of-shenton-way",
              type: "article",
            },
          ],
        },
      ],
    },
    {
      url: "perpetualsummer.ltd",
      title: "Perpetual Summer LTD",
      urlPrefix: "articles",
      ownerId: "did:ofTheOwner",
      contributors: ["did:ofContributorOne", "did:ofContributorTwo"],
      groups: [
        {
          slug: "tech",
          type: "group",
          title: "Technology",
          articles: ["some-article-slug", "some-other-article-slug"],
        },
        {
          slug: "business",
          type: "group",
          title: "Business News",
          articles: ["another-article-slug", "yet-another-article-slug"],
        },
      ],
    },
  ];
  return { sites: mockSiteData };
}

export default function Sites({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;
  console.log("sites", sites);

  const [selected, setSelected] = useState<string>("");
  const addSiteModal = useModal();

  const selectDropdownOptions = sites.map((site) => {
    return {
      value: site.url,
      label: site.title,
    };
  });

  return (
    <PageContainer
      title="Manage Sites"
      topButtons={
        <Button type="button" onClick={addSiteModal.open}>
          Add New Site
        </Button>
      }
    >
      <PageSection>
        <Select
          name="site"
          label="Site"
          options={selectDropdownOptions}
          // options={[
          //   { value: "uid:NoRobotsId", label: "NoRobots.blog" },
          //   { value: "uid:PerpetualSummerId", label: "PerpetualSummer.ltd" },
          // ]}
          value={selected}
          onChange={setSelected}
        />
        {selected && <p>SELECTED ITEM {selected}</p>}
      </PageSection>

      {/* PUT THIS INTO ITS OWN COMPONENT */}
      <Modal
        isOpen={addSiteModal.isOpen}
        onClose={addSiteModal.close}
        title="Add New Site"
        footer={
          <div className={styles.modalFooter}>
            <Button variant="secondary" onClick={addSiteModal.close}>
              Cancel
            </Button>
            <Button type="submit" form="add-site-form">
              Add Site
            </Button>
          </div>
        }
      >
        <form id="add-site-form">
          <Input
            id="site-title"
            name="title"
            label="Title"
            placeholder="My Blog"
          />
          <Input
            id="site-url"
            name="url"
            label="URL"
            placeholder="myblog.com"
          />
          <Input
            id="site-urlPrefix"
            name="urlPrefix"
            label="URL prefix"
            placeholder="blog"
          />
        </form>
      </Modal>
    </PageContainer>
  );
}
