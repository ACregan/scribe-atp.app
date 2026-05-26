# SCRIBE CMS DATA STRUCTURE

## Definitions

### User classifications

A OWNER is a user with the highest level of privileges, they can add, remove and change the SITEs via the CMS. They can add GROUPS and change the order they appear in. They can write ARTICLES and add them to GROUPS. They can add other users as CONTRIBUTORS to SITES. They can also see ARTICLES that CONTRIBUTORS have provided to this SITE and add them to GROUPS.

A CONTRIBUTOR is a user who has the ability to write articles for any SITE that they are a contributor to. Any article they write for that SITE will be available to the OWNER to add to GROUPS and publish on the SITE.

A user can become a CONTRIBUTOR after a OWNER adds the user to the Contributors list via the SITE management page. The exact mechanism as to how this can be achieved is not fully planned and this requires more thought. I think perhaps an email can be sent by the OWNER to the user who wishes to be a CONTRIBUTOR, the email (or bluesky dm?) will have a link the new CONTRIBUTOR clicks to join the list of contributors. Alternatives can be considered and I would welcome any ideas on other ways to achieve this.

## Concepts

A SITE is a reference to a website that we will use our CMS app to manage articles and content for. Its data comprises of a 'url' (string), 'title' (string), 'urlPrefix' (string), 'ownerId' (string: id of the user who is the owner of this site), 'contributors' (array, list of ids of users who can contribute articles to this site), 'groups' (array of objects, representing each of the groups of articles listed under this site)

A GROUP represents a collection of articles that are grouped together. Its data comprises of an array of objects. Each object represents a group and each group has a 'slug' (string) which is a section of the url that represents this category, 'title' (string) is the name that will be displayed in the UI, 'articles' (array of strings, each string being the slug of the articles that belong to this group)

AN ARTICLE represents an article or document, it comprises of a 'url' (string), 'title' (string), 'content' (string, serialised html) and 'createdAt' (string: timestamp)

## Rules

A SITE is owned by one single OWNER, the data for that site is stored on the OWNERs PDS

A SITE OWNER is solely responsible for the creation and order of GROUPS within the SITE(s) they own.

A SITE OWNER is solely responsible for assigning ARTICLES to GROUPS

## Data Structures

### Site

AT Protocol collection: `app.scribe.site`, rkey = URL-derived slug (e.g. `norobots-blog`)

```json
{
  "$type": "app.scribe.site",
  "url": "norobots.blog",
  "title": "NoRobots.blog",
  "urlPrefix": "blog",
  "contributors": ["did:plc:contributorOneId", "did:plc:contributorTwoId"],
  "groups": [
    {
      "slug": "engineering",
      "title": "Engineering",
      "articles": [
        {
          "uri": "at://did:plc:ownerId/app.scribe.article/my-first-post",
          "title": "My First Post",
          "splashImageUrl": "https://norobots.blog/images/my-first-post.jpg",
          "createdAt": "2025-01-01T00:00:00.000Z"
        },
        {
          "uri": "at://did:plc:contributorOneId/app.scribe.article/their-article",
          "title": "Their Article",
          "splashImageUrl": null,
          "createdAt": "2025-02-01T00:00:00.000Z"
        }
      ]
    },
    {
      "slug": "design",
      "title": "Design",
      "articles": [
        {
          "uri": "at://did:plc:ownerId/app.scribe.article/design-principles",
          "title": "Design Principles",
          "splashImageUrl": "https://norobots.blog/images/design-principles.jpg",
          "createdAt": "2025-03-01T00:00:00.000Z"
        }
      ]
    }
  ],
  "articles": [
    {
      "uri": "at://did:plc:ownerId/app.scribe.article/ungrouped-post",
      "title": "Ungrouped Post",
      "splashImageUrl": null,
      "createdAt": "2025-04-01T00:00:00.000Z"
    }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T12:00:00.000Z"
}
```

Notes:

- `ownerId` is omitted — the owner is whoever's PDS holds this record (their DID is the repo DID)
- Article references are objects (not bare AT URIs) containing cached metadata: `uri`, `title`, `splashImageUrl`, `createdAt`
- `uri` encodes everything needed to identify the article: author DID, collection, and rkey (slug)
- Cached metadata (`title`, `splashImageUrl`) may go stale if the author edits their article — a sync mechanism will be needed, especially for contributor articles
- `splashImageUrl` is nullable — not all articles have a splash image
- `cid` is deliberately excluded — storing it would cause `swapRecord` failures after any edit to the article; fetch it live at the point of deletion
- `articles` at the top level holds ungrouped articles (same role as the ROOT virtual group in the current list view)
- `groups` order is significant — it determines display order on the site
- `updatedAt` is useful for cache invalidation by public readers

### Article

AT Protocol collection: `app.scribe.article`, rkey = url slug (e.g. `my-first-post`)

```json
{
  "$type": "app.scribe.article",
  "title": "My First Post",
  "url": "my-first-post",
  "content": "<p>Article body as serialised HTML.</p>",
  "splashImageUrl": "https://norobots.blog/images/my-first-post.jpg",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

Notes:

- The article record is intentionally site-agnostic — it has no reference to any site or group
- The relationship between an article and a site is owned entirely by the SITE record (via AT URI in `groups[].articles` or top-level `articles`)
- The author is implicit from whose PDS holds the record — no `authorId` field is needed; the AT URI (`at://did/app.scribe.article/slug`) carries that information
- `url` doubles as the rkey — the slug used in the AT URI and in the public-facing URL path
- `splashImageUrl` is optional

---

# Future Planning

The following are items relating to features that will be planned and implemented in the future, for now this is just an area for ideas:

## FEATURE: Image Library

### Requirement

ScribeCMS will at some point require the ability to upload and organise images for use in splash images and article content.

### Purpose

To enable users to provide and reference images for use in the SITES and ARTICLES they use ScribeCMS to manage.

### Implementation

There will need to be a `/images` route implemented, it should show all of the images uploaded with the ability to navigate the folder structure, preview images, delete them or copy a image url to the clipboard for use in an article.

#### Appearance and Behaviour

The image library will have a similar layout and behaviour to a drive in windows explorer - it will show a grid array of all the images and folders in the library. The images can be organised into folders that can be created and deleted. Perhaps to avoid accidents we can restrict users to only delete empty folders.

The image library will be shared across all users: a user can use images uploaded by other users but they cannot delete or move them. It might be worth simplifying this by having a folder for each user in the library at the top level that can be navigated by everyone but only files that are descended from the current users user folder can be deleted or moved.

The upload process should be started by clicking a "Upload Image(s)" button which shows a simple `<input type="file" multiple/>` upload facility inside a modal. This should also support drag and drop. When an image(s) is dropped or selected for upload, a preview of the image(s) can be provided in the modal and then a button ("Upload (x) Files") is enabled. Once the user clicks this button to submit the selected files for upload there should be a progress bar for each file. Once the file uploads are all complete then the upload modal can be closed, or the user can select/drop more files for upload. Once the user has finished uploading the image(s), the newly uploaded images are shown in the root of their user folder in the `/images` view.

When an image is uploaded it should be optimised: For instance if the user uploads a BMP file that is 5000px x 5000px then, once the upload is complete, it should be processed: converted to a WEBP image file, optimised and resized to a more sensible maximum dimensions. Perhaps we should cap image dimensions to be max width or height of 3000px. We might also generate smaller versions (say, thumbnail: 300px, small:640px, medium:1000px, large:1600px, extraLarge:2000px and originalSize)

Another alternative approach is to have the images resized on demand with URL params (eg. "https://siteurl.com/images/imagefile.webp?maxWidthHeight=1000" would return an image with a max width or height, whichever is largest, of 1000px). This would be ideal but I have reservations that this might slow down the serving of images unless we cache them - which adds its own complexity which we might be best avoiding.

#### Server provisioning

This will be served from the same VPS that currently hosts the Scribe-atp.app website, it will use a filesystem-based image store.

As recommended by Claude, we will continue to use sqlite3 with 2 tables: `image_folders` (id, user_did, name, parent_id, created_at) and `images` (id, user_did, folder_id, filename, original_name, width, height, sizes as JSON, created_at).

Claude pointed out that there is a decision to be made around the per-image progress bar. The tradeoff is, if we drop the progress bar and just use a spinner then the implementation is much simpler and does not require changes to the react-router-serve implementation that we currently use. It does point out that these are one-time changes and are reasonably doable. We should dig into this in more detail before we proceed with implementation.
